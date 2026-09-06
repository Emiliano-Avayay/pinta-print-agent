import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { defaultConfigPath, defaultDataDir, defaultLogDir } from '../src/runtime-paths.js';
import { FileLogger, SecretRedactingLogger, redact } from '../src/logger.js';

const directory = () => mkdtempSync(join(tmpdir(), 'pinta-install-'));

test('runtime paths keep state outside the installed app directory', () => {
  const env = { LOCALAPPDATA: 'C:\\PintaUser\\AppData\\Local' } as NodeJS.ProcessEnv;
  assert.equal(defaultDataDir(env), 'C:\\PintaUser\\AppData\\Local\\PintaPrintAgent');
  assert.equal(defaultConfigPath(env), 'C:\\PintaUser\\AppData\\Local\\PintaPrintAgent\\config.json');
  assert.equal(defaultLogDir(env), 'C:\\PintaUser\\AppData\\Local\\PintaPrintAgent\\logs');
});

test('file logger persists structured records, redacts credentials, and rotates', () => {
  const logs = directory();
  const logger = new FileLogger(logs, { maxBytes: 80, maxFiles: 2 });
  logger.info('first', { agent_token: 'never-log-me', message: 'Authorization: Bearer also-never-log-me' });
  logger.warn('second', { nested: { authorization: 'hidden' } });
  logger.error('third', { message: 'still useful' });
  const output = [join(logs, 'agent.log'), join(logs, 'agent.log.1'), join(logs, 'agent.log.2')].filter(existsSync).map((path) => readFileSync(path, 'utf8')).join('');
  assert.match(output, /"event":"(first|second|third)"/);
  assert.equal(output.includes('never-log-me'), false);
  assert.equal(output.includes('also-never-log-me'), false);
  assert.equal(existsSync(join(logs, 'agent.log.1')), true);
  assert.deepEqual(redact({ Authorization: 'Bearer no', nested: { agent_token: 'no' } }), { Authorization: '[REDACTED]', nested: { agent_token: '[REDACTED]' } });
});

test('runtime-known tokens are redacted even when an error echoes their bare value', () => {
  const entries: Record<string, unknown>[] = [];
  const logger = new SecretRedactingLogger({ info: () => {}, warn: () => {}, error: (_event, fields) => entries.push(fields ?? {}) }, ['actual-secret']);
  logger.error('backend_error', { error: 'upstream echoed actual-secret unexpectedly' });
  assert.equal(String(entries[0].error).includes('actual-secret'), false);
});
