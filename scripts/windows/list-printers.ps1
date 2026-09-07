[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

if (Get-Command Get-Printer -ErrorAction SilentlyContinue) {
  $names = @(Get-Printer | Sort-Object -Property Name | ForEach-Object { $_.Name })
} else {
  $names = @(Get-CimInstance -ClassName Win32_Printer | Sort-Object -Property Name | ForEach-Object { $_.Name })
}

Write-Host 'Impresoras instaladas:'
if ($names.Count -eq 0) {
  Write-Host '- (no se encontraron impresoras)'
} else {
  $names | ForEach-Object { Write-Host "- $_" }
}
Write-Host ''
Write-Host 'Copie exactamente el nombre de la impresora térmica en:'
Write-Host 'printer.usb.printer_name'
