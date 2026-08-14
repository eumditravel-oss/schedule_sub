import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function localD1Options(env = process.env) {
  // Keep the SQLite files outside Wrangler's own state directory. Some
  // managed Windows workspaces make .wrangler read-only while still allowing
  // project-local test artifacts.
  const persistTo = resolve(env.LOCAL_D1_PERSIST_TO || '.local-d1');
  const configPath = resolve(env.LOCAL_D1_WRANGLER_CONFIG || 'wrangler.jsonc');
  const environment = String(env.LOCAL_D1_ENV || '').trim();
  return { persistTo, configPath, environment };
}

export function provisionLocalD1(env = process.env) {
  const { persistTo, configPath, environment } = localD1Options(env);
  mkdirSync(persistTo, { recursive: true });
  const npx = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npx';
  const args = [
    'wrangler', 'd1', 'migrations', 'apply', 'concost-db',
    '--local', '--persist-to', persistTo, '--config', configPath,
  ];
  if (environment) args.push('--env', environment);
  const spawnArgs = process.platform === 'win32' ? ['/d', '/c', 'npx.cmd', ...args] : args;
  const runtimeEnv = { ...env, CI: env.CI || '1', XDG_CONFIG_HOME: env.XDG_CONFIG_HOME || resolve('.wrangler-xdg') };
  const result = spawnSync(npx, spawnArgs, {
    cwd: resolve('.'),
    stdio: ['inherit', 'pipe', 'pipe'],
    env: runtimeEnv,
  });
  const output = `${result.stdout?.toString() || ''}${result.stderr?.toString() || ''}`;
  if (output) process.stdout.write(output);
  // The historical 0011 migration assumes a permission column that was
  // never declared by an earlier migration. Production already has the
  // column, but a fresh local database does not. Add this local-only shim and
  // retry so local provisioning remains migration-backed without introducing
  // a production migration.
  if (result.status !== 0 && /no such column:\s*can_manage_country_calendar/i.test(output)) {
    const compatArgs = [
      'wrangler', 'd1', 'execute', 'concost-db', '--local', '--persist-to', persistTo,
      '--config', configPath, '--command',
      "ALTER TABLE workers ADD COLUMN can_manage_country_calendar INTEGER NOT NULL DEFAULT 0",
    ];
    if (environment) compatArgs.push('--env', environment);
    const compatSpawnArgs = process.platform === 'win32' ? ['/d', '/c', 'npx.cmd', ...compatArgs] : compatArgs;
    const compat = spawnSync(npx, compatSpawnArgs, { cwd: resolve('.'), stdio: 'inherit', env: runtimeEnv });
    if (compat.status !== 0) throw new Error(`LOCAL_D1_COMPAT_SHIM_FAILED:${compat.status ?? 'unknown'}`);
    const retry = spawnSync(npx, spawnArgs, { cwd: resolve('.'), stdio: ['inherit', 'pipe', 'pipe'], env: runtimeEnv });
    const retryOutput = `${retry.stdout?.toString() || ''}${retry.stderr?.toString() || ''}`;
    if (retryOutput) process.stdout.write(retryOutput);
    if (retry.status === 0) {
      console.log(JSON.stringify({ type: 'LOCAL_D1_COMPAT_SHIM_APPLIED', column: 'workers.can_manage_country_calendar' }));
      console.log(JSON.stringify({ type: 'LOCAL_D1_PROVISIONED', persistTo, configPath, environment: environment || null }));
      return { persistTo, configPath, environment };
    }
    if (/duplicate column name:\s*schedule_revision/i.test(retryOutput)) {
      const markArgs = [
        'wrangler', 'd1', 'execute', 'concost-db', '--local', '--persist-to', persistTo,
        '--config', configPath, '--command',
        "INSERT OR IGNORE INTO d1_migrations (name,applied_at) VALUES ('0015_add_schedule_revision_to_tasks.sql',CURRENT_TIMESTAMP)",
      ];
      if (environment) markArgs.push('--env', environment);
      const markSpawnArgs = process.platform === 'win32' ? ['/d', '/c', 'npx.cmd', ...markArgs] : markArgs;
      const mark = spawnSync(npx, markSpawnArgs, { cwd: resolve('.'), stdio: 'inherit', env: runtimeEnv });
      if (mark.status !== 0) throw new Error(`LOCAL_D1_DUPLICATE_MIGRATION_MARK_FAILED:${mark.status ?? 'unknown'}`);
      const final = spawnSync(npx, spawnArgs, { cwd: resolve('.'), stdio: ['inherit', 'pipe', 'pipe'], env: runtimeEnv });
      const finalOutput = `${final.stdout?.toString() || ''}${final.stderr?.toString() || ''}`;
      if (finalOutput) process.stdout.write(finalOutput);
      if (final.status === 0) {
        console.log(JSON.stringify({ type: 'LOCAL_D1_DUPLICATE_MIGRATION_SKIPPED', migration: '0015_add_schedule_revision_to_tasks.sql' }));
        console.log(JSON.stringify({ type: 'LOCAL_D1_PROVISIONED', persistTo, configPath, environment: environment || null }));
        return { persistTo, configPath, environment };
      }
      throw new Error(`LOCAL_D1_PROVISION_FAILED_AFTER_DUPLICATE_MIGRATION:${final.status ?? 'unknown'}`);
    }
    throw new Error(`LOCAL_D1_PROVISION_FAILED_AFTER_COMPAT:${retry.status ?? 'unknown'}`);
  }
  if (result.status !== 0) {
    const detail = result.error instanceof Error ? `:${result.error.message}` : '';
    throw new Error(`LOCAL_D1_PROVISION_FAILED:${result.status ?? 'unknown'}${detail}`);
  }
  console.log(JSON.stringify({ type: 'LOCAL_D1_PROVISIONED', persistTo, configPath, environment: environment || null }));
  return { persistTo, configPath, environment };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) provisionLocalD1();
