[CmdletBinding()]
param([switch]$DryRun)

. (Join-Path $PSScriptRoot 'common.ps1')
Assert-Windows
Assert-OriginalUserContext
$nodePath = Get-NodeCommand
Write-Host "Installing scheduled startup for Pinta Print Agent from $script:AppRoot"
if ($DryRun) {
  Register-AgentTask -NodePath $nodePath -DryRun
  Write-Host "DRY RUN: would start task '$script:TaskName' only when config.json already exists"
  exit 0
}
if (-not (Test-Path -LiteralPath (Join-Path $script:AppRoot 'dist\main.js'))) { throw "Installed app entry point is missing. Reinstall Pinta Print Agent." }
New-Item -ItemType Directory -Force -Path $script:InstallRoot, $script:LogRoot | Out-Null

if (Get-ScheduledTask -TaskName $script:TaskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $script:TaskName -ErrorAction SilentlyContinue
  $deadline = (Get-Date).AddSeconds(30)
  while ((Get-ScheduledTask -TaskName $script:TaskName).State -eq 'Running' -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
  if ((Get-ScheduledTask -TaskName $script:TaskName).State -eq 'Running') { throw "Timed out stopping '$script:TaskName' before updating the installed application." }
}

Register-AgentTask -NodePath $nodePath
Protect-PintaConfig
if (Test-Path -LiteralPath $script:ConfigPath) { Start-ScheduledTask -TaskName $script:TaskName }
Write-Host "Installed application: $script:AppRoot"
Write-Host "Persistent configuration: $script:ConfigPath"
Write-Host "Persistent database: $(Join-Path $script:InstallRoot 'agent.sqlite')"
Write-Host "Persistent logs: $script:LogRoot"
