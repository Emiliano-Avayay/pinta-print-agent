[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:TaskName = 'Pinta Print Agent'
# Resolve both identity and profile from the process token.  These scripts are
# intentionally run by the cashier's unelevated Setup/configurator, never by a
# UAC credential-provider account.
$script:OriginalIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$script:OriginalUserName = $script:OriginalIdentity.Name
$script:OriginalUserSid = $script:OriginalIdentity.User.Value
$script:LocalAppData = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
$script:InstallRoot = Join-Path $script:LocalAppData 'PintaPrintAgent'
$script:AppRoot = Join-Path $script:InstallRoot 'app'
$script:RuntimeRoot = Join-Path $script:AppRoot 'runtime'
$script:RuntimeNodePath = Join-Path $script:RuntimeRoot 'node.exe'
$script:ConfigPath = Join-Path $script:InstallRoot 'config.json'
$script:LogRoot = Join-Path $script:InstallRoot 'logs'

function Assert-Windows {
  if ($env:OS -ne 'Windows_NT') { throw 'Pinta Print Agent installation scripts only support Windows.' }
}

function Assert-OriginalUserContext {
  # An elevated run can be using credentials for a different Windows account.
  # Refuse it rather than ever writing the cashier's token into that profile.
  $principal = New-Object System.Security.Principal.WindowsPrincipal($script:OriginalIdentity)
  if ($principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run Pinta Print Agent without elevation. Only the optional POS driver installer requests administrator permission.'
  }
}

function Get-NodeCommand {
  if (-not (Test-Path -LiteralPath $script:RuntimeNodePath)) { throw "Private Node runtime was not found: $script:RuntimeNodePath. Reinstall Pinta Print Agent." }
  $versionText = (& $script:RuntimeNodePath --version).Trim()
  if ($versionText -notmatch '^v?(\d+)\.') { throw "Could not determine Node.js version: $versionText" }
  if ([int]$Matches[1] -lt 24) { throw "Private Node runtime must be >= 24; found $versionText." }
  return $script:RuntimeNodePath
}

function Get-SourceRoot { return (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path }

function Get-TaskState {
  $task = Get-ScheduledTask -TaskName $script:TaskName -ErrorAction SilentlyContinue
  if (-not $task) { return $null }
  $info = Get-ScheduledTaskInfo -TaskName $script:TaskName
  return [pscustomobject]@{ Task = $task; Info = $info }
}

function Register-AgentTask {
  param([string]$NodePath, [switch]$DryRun)
  $entryPoint = Join-Path $script:AppRoot 'dist\main.js'
  if ($DryRun) { Write-Host "DRY RUN: register task '$script:TaskName' at logon using $NodePath $entryPoint"; return }
  $action = New-ScheduledTaskAction -Execute $NodePath -Argument ('"{0}"' -f $entryPoint) -WorkingDirectory $script:AppRoot
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $script:OriginalUserName
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -Hidden -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Seconds 0)
  $principal = New-ScheduledTaskPrincipal -UserId $script:OriginalUserSid -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $script:TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Starts Pinta Print Agent at Windows logon.' -Force | Out-Null
}

function Protect-PintaConfig {
  if (-not (Test-Path -LiteralPath $script:ConfigPath)) { return }
  # Restrict the token file to the current Windows account, SYSTEM and Administrators.
  & icacls.exe $script:ConfigPath /inheritance:r /grant:r "${script:OriginalUserName}:(R,W)" 'SYSTEM:(F)' 'Administrators:(F)' | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Warning "Could not restrict permissions on $script:ConfigPath" }
}
