[CmdletBinding()]
param()
. (Join-Path $PSScriptRoot 'common.ps1')
Assert-Windows
Assert-OriginalUserContext
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$node = Get-NodeCommand
$cli = Join-Path $script:AppRoot 'dist\configurator-cli.js'

function Get-InstalledPrinters {
  $source = if (Get-Command Get-Printer -ErrorAction SilentlyContinue) { Get-Printer } else { Get-CimInstance Win32_Printer }
  return @($source | Sort-Object Name | ForEach-Object {
    [pscustomobject]@{ Name = $_.Name; Driver = $_.DriverName; Port = $_.PortName; Status = $_.PrinterStatus }
  })
}
function Invoke-ConfigWrite {
  $output = & $node $cli write $script:ConfigPath $server.Text $location.Text $token.Text $printers.Text 2>&1
  if ($LASTEXITCODE -ne 0) { throw ($output -join "`n") }
  Protect-PintaConfig
}
function Show-Message([string]$text, [System.Windows.Forms.MessageBoxIcon]$icon = [System.Windows.Forms.MessageBoxIcon]::Information) { [void][System.Windows.Forms.MessageBox]::Show($form, $text, 'Pinta Print Agent', [System.Windows.Forms.MessageBoxButtons]::OK, $icon) }

$form = New-Object System.Windows.Forms.Form
$form.Text = 'Configurar Pinta Print Agent'; $form.Width = 640; $form.Height = 420; $form.StartPosition = 'CenterScreen'; $form.FormBorderStyle = 'FixedDialog'; $form.MaximizeBox = $false

function Add-Field([string]$label, [int]$top, [bool]$password = $false) {
  $caption = New-Object System.Windows.Forms.Label; $caption.Text = $label; $caption.Left = 20; $caption.Top = $top + 4; $caption.Width = 130
  $field = New-Object System.Windows.Forms.TextBox; $field.Left = 155; $field.Top = $top; $field.Width = 450; $field.UseSystemPasswordChar = $password
  $form.Controls.AddRange(@($caption, $field)); return $field
}
$server = Add-Field 'Servidor' 24
$location = Add-Field 'Location ID' 64
$token = Add-Field 'Token' 104 $true
$printers = New-Object System.Windows.Forms.ComboBox; $printers.Left = 155; $printers.Top = 144; $printers.Width = 450; $printers.DropDownStyle = 'DropDownList'
$label = New-Object System.Windows.Forms.Label; $label.Text = 'Impresora'; $label.Left = 20; $label.Top = 148; $label.Width = 130; $form.Controls.AddRange(@($label, $printers))
$description = New-Object System.Windows.Forms.Label; $description.Left = 155; $description.Top = 176; $description.Width = 450; $description.Height = 42; $description.Text = 'Perfil: 80mm · Corte: activado'; $form.Controls.Add($description)

$printerData = Get-InstalledPrinters
foreach ($item in $printerData) { [void]$printers.Items.Add($item.Name) }
$printers.Add_SelectedIndexChanged({ $selected = $printerData | Where-Object Name -eq $printers.Text | Select-Object -First 1; if ($selected) { $description.Text = "Perfil: 80mm · Corte: activado`r`nDriver: $($selected.Driver) · Puerto (diagnóstico): $($selected.Port) · Estado: $($selected.Status)" } })

$server.Text = 'https://pedidopinta.com.ar'; $location.Text = 'pinta-main'
if (Test-Path -LiteralPath $script:ConfigPath) { try { $old = Get-Content -Raw $script:ConfigPath | ConvertFrom-Json; $server.Text = $old.server_url; $location.Text = $old.location_id; $token.Text = $old.agent_token; $index = $printers.Items.IndexOf($old.printer.usb.printer_name); if ($index -ge 0) { $printers.SelectedIndex = $index } } catch {} }
if ($printers.SelectedIndex -lt 0 -and $printers.Items.Count -gt 0) { $printers.SelectedIndex = 0 }

$connection = New-Object System.Windows.Forms.Button; $connection.Text = 'Probar conexión'; $connection.Left = 20; $connection.Top = 250; $connection.Width = 160
$print = New-Object System.Windows.Forms.Button; $print.Text = 'Imprimir prueba'; $print.Left = 195; $print.Top = 250; $print.Width = 160
$save = New-Object System.Windows.Forms.Button; $save.Text = 'Guardar y finalizar'; $save.Left = 370; $save.Top = 250; $save.Width = 235
$hint = New-Object System.Windows.Forms.Label; $hint.Left = 20; $hint.Top = 305; $hint.Width = 580; $hint.Height = 45; $hint.Text = 'La impresión de prueba usa ESC/POS RAW y la cola de Windows seleccionada. El puerto sólo se muestra como diagnóstico.'
$form.Controls.AddRange(@($connection, $print, $save, $hint))

$connection.Add_Click({ try { Invoke-ConfigWrite; $result = & $node $cli health $script:ConfigPath 2>&1; if ($LASTEXITCODE -ne 0) { throw ($result -join "`n") }; Show-Message 'Servidor conectado correctamente.' } catch { Show-Message $_.Exception.Message ([System.Windows.Forms.MessageBoxIcon]::Error) } })
$print.Add_Click({ try { Invoke-ConfigWrite; $result = & $node $cli print-test $script:ConfigPath 2>&1; if ($LASTEXITCODE -ne 0) { throw ($result -join "`n") }; Show-Message 'Impresión de prueba enviada correctamente.' } catch { Show-Message $_.Exception.Message ([System.Windows.Forms.MessageBoxIcon]::Error) } })
$save.Add_Click({ try { Invoke-ConfigWrite; & (Join-Path $PSScriptRoot 'install.ps1'); if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar el agente.' }; Show-Message 'Configuración guardada y Pinta Print Agent ejecutándose.'; $form.Close() } catch { Show-Message $_.Exception.Message ([System.Windows.Forms.MessageBoxIcon]::Error) } })
[void]$form.ShowDialog()
