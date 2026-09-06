[CmdletBinding()]
param([switch]$DryRun)

. (Join-Path $PSScriptRoot 'common.ps1')
Assert-Windows
$nodePath = Get-NodeCommand
$sourceRoot = Get-SourceRoot
$npm = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $npm) { throw 'npm.cmd was not found alongside Node.js.' }

Write-Host "Preparing Pinta Print Agent from $sourceRoot"
if ($DryRun) {
  Write-Host "DRY RUN: would verify/build with $npm, copy runtime to $script:AppRoot, preserve $script:ConfigPath and $script:LogRoot"
  Register-AgentTask -NodePath $nodePath -DryRun
  Write-Host "DRY RUN: would start task '$script:TaskName' only when config.json already exists"
  exit 0
}

& $npm ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed while preparing the build.' }
& $npm run build
if ($LASTEXITCODE -ne 0) { throw 'npm run build failed.' }

New-Item -ItemType Directory -Force -Path $script:InstallRoot, $script:LogRoot | Out-Null
$configCreated = $false
if (-not (Test-Path -LiteralPath $script:ConfigPath)) {
  Copy-Item -LiteralPath (Join-Path $sourceRoot 'config.example.json') -Destination $script:ConfigPath
  $configCreated = $true
  Write-Warning "Created configuration template at $script:ConfigPath. Fill agent_token and printer settings before starting the agent."
}

if (Get-ScheduledTask -TaskName $script:TaskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $script:TaskName -ErrorAction SilentlyContinue
  $deadline = (Get-Date).AddSeconds(30)
  while ((Get-ScheduledTask -TaskName $script:TaskName).State -eq 'Running' -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
  if ((Get-ScheduledTask -TaskName $script:TaskName).State -eq 'Running') { throw "Timed out stopping '$script:TaskName' before updating the installed application." }
}

$stagingRoot = Join-Path $script:InstallRoot 'app.next'
Remove-Item -LiteralPath $stagingRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $stagingRoot | Out-Null
Copy-Item -LiteralPath (Join-Path $sourceRoot 'dist') -Destination (Join-Path $stagingRoot 'dist') -Recurse
Copy-Item -LiteralPath (Join-Path $sourceRoot 'package.json'), (Join-Path $sourceRoot 'package-lock.json') -Destination $stagingRoot
Push-Location $stagingRoot
try {
  & $npm ci --omit=dev
  if ($LASTEXITCODE -ne 0) { throw 'Production dependency installation failed.' }
} finally { Pop-Location }

if (Test-Path -LiteralPath $script:AppRoot) { Remove-Item -LiteralPath $script:AppRoot -Recurse -Force }
Move-Item -LiteralPath $stagingRoot -Destination $script:AppRoot
Register-AgentTask -NodePath $nodePath
if ($configCreated) {
  Write-Host "Task '$script:TaskName' was registered but not started because config.json is a new template. Complete it, then run scripts\\windows\\start.ps1."
} else { Start-ScheduledTask -TaskName $script:TaskName }
Write-Host "Installed application: $script:AppRoot"
Write-Host "Persistent configuration: $script:ConfigPath"
Write-Host "Persistent database: $(Join-Path $script:InstallRoot 'agent.sqlite')"
Write-Host "Persistent logs: $script:LogRoot"
