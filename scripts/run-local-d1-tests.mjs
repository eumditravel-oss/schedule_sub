import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { provisionLocalD1 } from './provision-local-d1.mjs';

const options = provisionLocalD1(process.env);
const npx = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npx';
const requestedSpecs = process.argv.slice(2);
const extraArgs = requestedSpecs.length ? requestedSpecs : [
  'tests/localD1Provisioning.integration.test.ts',
  'tests/testClock.test.ts',
];
// All selected integration suites share one persisted D1 intentionally. Run
// files serially so a fixture reset in one suite cannot race another suite.
const vitestArgs = process.platform === 'win32'
  ? ['/d', '/c', 'npx.cmd', 'vitest', 'run', '--no-file-parallelism', ...extraArgs]
  : ['vitest', 'run', '--no-file-parallelism', ...extraArgs];
const result = spawnSync(npx, vitestArgs, {
  cwd: resolve('.'),
  stdio: 'inherit',
  env: {
    ...process.env,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME || resolve('.wrangler-xdg'),
    LOCAL_D1_PERSIST_TO: resolve(options.persistTo, 'v3'),
    LOCAL_D1_WRANGLER_CONFIG: options.configPath,
    V3_LOCAL_D1_PERSIST_TO: resolve(options.persistTo, 'v3'),
    V3_LOCAL_WRANGLER_CONFIG: options.configPath,
    FORECAST_LOCAL_D1_PERSIST_TO: resolve(options.persistTo, 'v3'),
    FORECAST_LOCAL_WRANGLER_CONFIG: options.configPath,
    SHADOW_LOCAL_D1_PERSIST_TO: resolve(options.persistTo, 'v3'),
    SHADOW_LOCAL_WRANGLER_CONFIG: options.configPath,
  },
});
process.exit(result.status ?? 1);
