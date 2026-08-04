// scripts/backfill-translations.ts
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

const DEPLOYED_TRANSLATE_URL = 'https://concost-dev-scheduler.eumditravel.workers.dev/api/translate';

function escapeSqlString(str: string): string {
  return str.replace(/'/g, "''");
}

async function translateTextRemote(text: string, sourceLang: 'ko' | 'vi', targetLang: 'ko' | 'vi'): Promise<string> {
  const res = await fetch(DEPLOYED_TRANSLATE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, source_language: sourceLang, target_language: targetLang }),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error?.message || 'Translation API request failed');
  }
  return json.data.translated_text || '';
}

async function runBackfill() {
  console.log(`\n==================================================`);
  console.log(`[Translation Backfill] Mode: ${isDryRun ? 'DRY-RUN' : 'LIVE EXECUTION'}`);
  console.log(`==================================================\n`);

  // Step 1: Query PENDING or FAILED projects
  console.log('fetching pending or failed records from remote Cloudflare D1 database...');

  const queryProjectsCmd = `npx wrangler d1 execute concost-db --remote --command="SELECT id, name, source_language, name_ko, name_vi, translation_status FROM projects WHERE translation_status IN ('PENDING', 'FAILED') OR translation_status IS NULL;" --json`;
  const queryTasksCmd = `npx wrangler d1 execute concost-db --remote --command="SELECT id, task_name, source_language, task_name_ko, task_name_vi, translation_status FROM tasks WHERE translation_status IN ('PENDING', 'FAILED') OR translation_status IS NULL;" --json`;

  let pendingProjects: any[] = [];
  let pendingTasks: any[] = [];

  try {
    const rawProj = execSync(queryProjectsCmd, { encoding: 'utf-8', cwd: process.cwd() });
    const parsedProj = JSON.parse(rawProj);
    pendingProjects = parsedProj[0]?.results || [];
  } catch (err: any) {
    console.warn('Could not query projects from D1:', err.message);
  }

  try {
    const rawTasks = execSync(queryTasksCmd, { encoding: 'utf-8', cwd: process.cwd() });
    const parsedTasks = JSON.parse(rawTasks);
    pendingTasks = parsedTasks[0]?.results || [];
  } catch (err: any) {
    console.warn('Could not query tasks from D1:', err.message);
  }

  console.log(`Found ${pendingProjects.length} projects and ${pendingTasks.length} tasks requiring backfill.\n`);

  if (isDryRun) {
    console.log('[DRY-RUN SUMMARY]');
    console.log('Project Target IDs:', pendingProjects.map((p) => p.id));
    console.log('Task Target IDs:', pendingTasks.map((t) => t.id));
    console.log(`\nDry run completed successfully. No records were modified.`);
    return;
  }

  if (pendingProjects.length === 0 && pendingTasks.length === 0) {
    console.log('All records are already translated (COMPLETED/MANUAL). Nothing to do.');
    return;
  }

  let successCount = 0;
  let failCount = 0;
  const sqlStatements: string[] = [];

  // Process Projects
  for (const prj of pendingProjects) {
    const srcLang = prj.source_language === 'vi' ? 'vi' : 'ko';
    const targetLang = srcLang === 'ko' ? 'vi' : 'ko';
    const textToTranslate = prj.name || '';

    if (!textToTranslate) continue;

    try {
      console.log(`Translating project [${prj.id}]: "${textToTranslate}" (${srcLang} -> ${targetLang})...`);
      const translated = await translateTextRemote(textToTranslate, srcLang, targetLang);

      const nameKo = srcLang === 'ko' ? textToTranslate : translated;
      const nameVi = srcLang === 'vi' ? textToTranslate : translated;

      sqlStatements.push(
        `UPDATE projects SET name_ko = '${escapeSqlString(nameKo)}', name_vi = '${escapeSqlString(nameVi)}', translation_status = 'COMPLETED', translation_error = NULL WHERE id = '${escapeSqlString(prj.id)}';`
      );
      successCount++;
    } catch (err: any) {
      console.error(`Failed to translate project [${prj.id}]:`, err.message);
      sqlStatements.push(
        `UPDATE projects SET translation_status = 'FAILED', translation_error = '${escapeSqlString(err.message)}' WHERE id = '${escapeSqlString(prj.id)}';`
      );
      failCount++;
    }
  }

  // Process Tasks
  for (const tsk of pendingTasks) {
    const srcLang = tsk.source_language === 'vi' ? 'vi' : 'ko';
    const targetLang = srcLang === 'ko' ? 'vi' : 'ko';
    const textToTranslate = tsk.task_name || '';

    if (!textToTranslate) continue;

    try {
      console.log(`Translating task [${tsk.id}]: "${textToTranslate}" (${srcLang} -> ${targetLang})...`);
      const translated = await translateTextRemote(textToTranslate, srcLang, targetLang);

      const taskNameKo = srcLang === 'ko' ? textToTranslate : translated;
      const taskNameVi = srcLang === 'vi' ? textToTranslate : translated;

      sqlStatements.push(
        `UPDATE tasks SET task_name_ko = '${escapeSqlString(taskNameKo)}', task_name_vi = '${escapeSqlString(taskNameVi)}', translation_status = 'COMPLETED', translation_error = NULL WHERE id = '${escapeSqlString(tsk.id)}';`
      );
      successCount++;
    } catch (err: any) {
      console.error(`Failed to translate task [${tsk.id}]:`, err.message);
      sqlStatements.push(
        `UPDATE tasks SET translation_status = 'FAILED', translation_error = '${escapeSqlString(err.message)}' WHERE id = '${escapeSqlString(tsk.id)}';`
      );
      failCount++;
    }
  }

  if (sqlStatements.length > 0) {
    const tmpSqlPath = path.join(process.cwd(), 'temp_backfill.sql');
    fs.writeFileSync(tmpSqlPath, sqlStatements.join('\n'), 'utf-8');

    console.log(`\nApplying ${sqlStatements.length} backfill SQL updates to remote D1...`);
    try {
      execSync(`npx wrangler d1 execute concost-db --remote --file=${tmpSqlPath}`, {
        stdio: 'inherit',
        cwd: process.cwd(),
      });
      console.log('Remote D1 update complete.');
    } finally {
      if (fs.existsSync(tmpSqlPath)) {
        fs.unlinkSync(tmpSqlPath);
      }
    }
  }

  console.log(`\n==================================================`);
  console.log(`[Backfill Complete] Total Processed: ${successCount + failCount} | Success: ${successCount} | Failed: ${failCount}`);
  console.log(`==================================================\n`);
}

runBackfill().catch((err) => {
  console.error('[Backfill Error]', err);
  process.exit(1);
});
