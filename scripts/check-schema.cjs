// scripts/check-schema.cjs
const { execSync } = require('child_process');

const env = process.argv[2] || 'qa';
const dbName = env === 'qa' ? 'concost-db-qa' : 'concost-db';
const envFlag = env === 'qa' ? '-e qa' : '';

try {
  const cmd = `npx wrangler d1 execute ${dbName} ${envFlag} --remote --command="PRAGMA table_info(tasks);"`;
  const output = execSync(cmd, { encoding: 'utf8' });
  if (!output.includes('schedule_revision')) {
    console.error(`SCHEMA_MIGRATION_REQUIRED: ${env} D1 database tasks table is missing required column schedule_revision.`);
    process.exit(1);
  }
  console.log(`Schema preflight check passed for ${env} environment.`);
} catch (e) {
  console.error(`Schema check error:`, e.message);
  process.exit(1);
}
