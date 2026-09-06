import { homedir } from 'node:os';
import { join } from 'node:path';

/** Durable, user-owned files. This directory is deliberately outside the app package. */
export function defaultDataDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.LOCALAPPDATA || join(homedir(), '.local'), 'PintaPrintAgent');
}

export function defaultConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(defaultDataDir(env), 'config.json');
}

export function defaultLogDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(defaultDataDir(env), 'logs');
}
