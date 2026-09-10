[CmdletBinding()]
param()
. (Join-Path $PSScriptRoot 'common.ps1')
Assert-Windows

function Get-PrinterDetails([string]$name) {
  if (-not $name) { return 'Impresora configurada: (sin configurar)' }
  $printer = if (Get-Command Get-Printer -ErrorAction SilentlyContinue) { Get-Printer -Name $name -ErrorAction SilentlyContinue } else { Get-CimInstance Win32_Printer -Filter "Name='$($name.Replace("'", "''"))" -ErrorAction SilentlyContinue }
  if (-not $printer) { return "Impresora configurada: $name`r`nDetectada por Windows: no" }
  return "Impresora configurada: $name`r`nDetectada por Windows: sí`r`nDriver: $($printer.DriverName)`r`nPuerto: $($printer.PortName)`r`nEstado: $($printer.PrinterStatus)"
}

$version = '(desconocida)'
try { $version = (Get-Content -Raw (Join-Path $script:AppRoot 'package.json') | ConvertFrom-Json).version } catch {}
$details = @("Pinta Print Agent $version", "Ruta: $script:InstallRoot")
$config = $null
if (Test-Path -LiteralPath $script:ConfigPath) { try { $config = Get-Content -Raw $script:ConfigPath | ConvertFrom-Json; $details += "Servidor: $($config.server_url)"; $details += "Location ID: $($config.location_id)"; $details += Get-PrinterDetails $config.printer.usb.printer_name } catch { $details += "Configuración: inválida ($($_.Exception.Message))" } } else { $details += 'Configuración: no creada' }
$state = Get-TaskState
$details += if ($state) { "Tarea programada: $($state.Task.State), último resultado $($state.Info.LastTaskResult)" } else { 'Tarea programada: no instalada' }
if ($config) { $node = Get-NodeCommand; $health = & $node (Join-Path $script:AppRoot 'dist\configurator-cli.js') health $script:ConfigPath 2>&1; $details += "Servidor: $($health -join ' ')" }
$logPath = Join-Path $script:LogRoot 'agent.log'
if (Test-Path -LiteralPath $logPath) { $details += "`r`nÚltimas líneas del log:`r`n$((Get-Content -LiteralPath $logPath -Tail 20) -join "`r`n")" }

Add-Type -AssemblyName System.Windows.Forms
$form = New-Object System.Windows.Forms.Form; $form.Text = 'Diagnóstico - Pinta Print Agent'; $form.Width = 760; $form.Height = 560
$box = New-Object System.Windows.Forms.TextBox; $box.Multiline = $true; $box.ReadOnly = $true; $box.ScrollBars = 'Both'; $box.WordWrap = $false; $box.Dock = 'Fill'; $box.Font = New-Object System.Drawing.Font('Consolas', 10); $box.Text = $details -join "`r`n"
$form.Controls.Add($box); [void]$form.ShowDialog()
