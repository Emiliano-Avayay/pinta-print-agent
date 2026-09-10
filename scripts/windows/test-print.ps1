[CmdletBinding()]
param()
. (Join-Path $PSScriptRoot 'common.ps1')
Assert-Windows
$node = Get-NodeCommand
& $node (Join-Path $script:AppRoot 'dist\configurator-cli.js') print-test $script:ConfigPath
if ($LASTEXITCODE -ne 0) { throw 'La impresión de prueba falló. Revise el diagnóstico y los logs.' }
