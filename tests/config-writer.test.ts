import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ConfigError } from '../src/config.js';
import { toConfigDocument, writeConfigAtomically } from '../src/config-writer.js';

test('installer configuration writer preserves the Windows queue name and production profile', () => {
  const document = toConfigDocument({ serverUrl: 'https://pedidopinta.com.ar/', locationId: 'pinta-main', agentToken: 'secret', printerName: 'POS-80' });
  assert.deepEqual(document.printer, { mode: 'usb', profile: '80mm', supports_cut: true, usb: { printer_name: 'POS-80' } });
  assert.equal(document.server_url, 'https://pedidopinta.com.ar');
});

test('installer configuration writer validates before atomically replacing the current config', () => {
  const root = mkdtempSync(join(tmpdir(), 'pinta-config-writer-'));
  const path = join(root, 'config.json');
  writeFileSync(path, '{"existing":true}\n');
  assert.throws(() => writeConfigAtomically(path, { serverUrl: 'not a URL', locationId: 'pinta-main', agentToken: 'token', printerName: 'POS-80' }), ConfigError);
  assert.equal(readFileSync(path, 'utf8'), '{"existing":true}\n');
  const config = writeConfigAtomically(path, { serverUrl: 'https://pedidopinta.com.ar', locationId: 'pinta-main', agentToken: 'token', printerName: 'POS-80' });
  assert.equal('mode' in config.printer && config.printer.mode, 'usb');
  assert.equal(existsSync(path), true);
  assert.equal(readFileSync(path, 'utf8').includes('POS-80'), true);
});
