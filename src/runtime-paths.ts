import { homedir } from 'node:os';
import { join, win32 } from 'node:path';

const joinRuntimePath = (env: NodeJS.ProcessEnv, ...parts: string[]): string =>
  env.LOCALAPPDATA?.includes('\\') ? win32.join(...parts) : join(...parts);

/** Durable, user-owned files. This directory is deliberately outside the app package. */
export function defaultDataDir(env: NodeJS.ProcessEnv = process.env): string {
  return joinRuntimePath(env, env.LOCALAPPDATA || join(homedir(), '.local'), 'PintaPrintAgent');
}

export function defaultConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return joinRuntimePath(env, defaultDataDir(env), 'config.json');
}

export function defaultLogDir(env: NodeJS.ProcessEnv = process.env): string {
  return joinRuntimePath(env, defaultDataDir(env), 'logs');
}
