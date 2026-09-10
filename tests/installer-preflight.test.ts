import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { platform } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

test('Inno Setup preflight keeps zero, one, and many candidates as arrays', { skip: platform() !== 'win32' }, () => {
  const result = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resolve('tests/installer-preflight.test.ps1')],
    { encoding: 'utf8' },
  );
  assert.equal(result, '');
});
