import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const read = (path: string) => readFileSync(resolve(path), 'utf8');

test('Windows Setup remains per-user while the optional POS driver elevates alone', () => {
  const installer = read('installer/PintaPrintAgent.iss');

  assert.match(installer, /^PrivilegesRequired=lowest$/m);
  assert.match(installer, /^PrivilegesRequiredOverridesAllowed=commandline$/m);
  assert.doesNotMatch(installer, /^PrivilegesRequired=admin$/m);
  assert.match(installer, /Result := not IsAdminInstallMode/);
  assert.match(installer, /DefaultDirName=\{localappdata\}\\PintaPrintAgent/);
  assert.match(installer, /ShellExec\('runas', ExpandConstant\('\{tmp\}\\POS Printer Driver Setup V11\.3\.0\.3\.exe'\)/);
  assert.doesNotMatch(installer, /Exec\(ExpandConstant\('\{tmp\}\\POS Printer Driver Setup/);
});

test('Windows scripts bind data and the agent task to the original unelevated user', () => {
  const common = read('scripts/windows/common.ps1');
  const configure = read('scripts/windows/configure.ps1');
  const install = read('scripts/windows/install.ps1');

  assert.match(common, /WindowsIdentity\]::GetCurrent\(\)/);
  assert.match(common, /GetFolderPath\(\[Environment\+SpecialFolder\]::LocalApplicationData\)/);
  assert.doesNotMatch(common, /\$env:LOCALAPPDATA/);
  assert.doesNotMatch(common, /\$env:USERNAME/);
  assert.match(common, /New-ScheduledTaskTrigger -AtLogOn -User \$script:OriginalUserName/);
  assert.match(common, /New-ScheduledTaskPrincipal -UserId \$script:OriginalUserSid -LogonType Interactive -RunLevel Limited/);
  assert.match(common, /Register-ScheduledTask .* -Principal \$principal/);
  assert.match(common, /"\*\$\(\$script:OriginalUserSid\):\(R,W\)"/);
  assert.match(common, /'\*S-1-5-18:\(F\)'/);
  assert.match(common, /'\*S-1-5-32-544:\(F\)'/);
  assert.doesNotMatch(common, /'SYSTEM:\(F\)'/);
  assert.doesNotMatch(common, /'Administrators:\(F\)'/);
  assert.match(common, /\$icaclsExitCode = \$LASTEXITCODE/);
  assert.match(common, /icacls exit code \$icaclsExitCode/);
  assert.match(configure, /Assert-OriginalUserContext/);
  assert.match(install, /Assert-OriginalUserContext/);
});

test('Windows Setup stages PowerShell scripts as UTF-8 with BOM and hides its host console', () => {
  const installer = read('installer/PintaPrintAgent.iss');
  const prepare = read('installer/prepare.ps1');

  assert.match(installer, /-WindowStyle Hidden -ExecutionPolicy Bypass -File/);
  assert.match(installer, /configure\.ps1'\) \+ '"', '', SW_HIDE/);
  assert.match(prepare, /Convert-PintaScriptsToUtf8Bom/);
  assert.match(prepare, /Assert-ConfigureScriptEncoding/);
  assert.match(prepare, /0xEF.*0xBB.*0xBF/);
  for (const word of ['conexión', 'impresión', 'diagnóstico', 'configuración']) {
    assert.match(prepare, new RegExp(word));
  }
});

test('upgrade and uninstall leave persistent user data in place unless explicitly purged', () => {
  const installer = read('installer/PintaPrintAgent.iss');
  const uninstall = read('scripts/windows/uninstall.ps1');

  assert.match(installer, /DestDir: "\{localappdata\}\\PintaPrintAgent\\app"/);
  assert.match(uninstall, /Remove-Item -LiteralPath \$script:AppRoot -Recurse -Force/);
  assert.match(uninstall, /if \(\$PurgeData\)/);
});
