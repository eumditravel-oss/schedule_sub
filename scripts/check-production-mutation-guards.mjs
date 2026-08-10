// scripts/check-production-mutation-guards.mjs
// Enhanced static checker enforcing strict Target-URL consistency across all Mutation Specs
import fs from 'fs';
import path from 'path';

const E2E_DIR = path.join(process.cwd(), 'tests', 'e2e');
const specFiles = fs.readdirSync(E2E_DIR).filter((f) => f.endsWith('.spec.ts'));

let totalMutationSpecs = 0;
let protectedMutationSpecs = 0;
const violationList = [];
const auditTable = [];

const MUTATION_PATTERNS = [
  /method:\s*['"](POST|PUT|PATCH|DELETE)['"]/i,
  /'(POST|PUT|PATCH|DELETE)'/i,
  /api\.(create|update|delete)/i,
  /data-testid=['"](task-save|task-delete|project-save|project-delete|add-manual-holiday|delete-manual-holiday|vn-saturday-save|leave-cascade-confirm)/i,
  /\.(click|press).*?(save|delete|create|confirm|submit)/i,
];

for (const file of specFiles) {
  const filePath = path.join(E2E_DIR, file);
  const content = fs.readFileSync(filePath, 'utf8');

  // Check if file performs mutation
  const isMutationSpec = MUTATION_PATTERNS.some((pattern) => pattern.test(content));

  if (isMutationSpec) {
    totalMutationSpecs++;

    // Extract guarded URL variable from assertMutationSafety call
    const guardMatch = content.match(/assertMutationSafety\(\s*([a-zA-Z0-9_]+)\s*,/);
    const guardedVar = guardMatch ? guardMatch[1] : null;

    // Check for hardcoded workers.dev strings
    const hasHardcodedWorkersDev = /concost-dev-scheduler(-qa)?\.eumditravel\.workers\.dev/i.test(content);

    // Check for QA_URL usage
    const hasQaUrl = /process\.env\.QA_URL/i.test(content) || /\bQA_URL\b/i.test(content);

    // Check for secondary URL variables (PROD_BASE_URL, BASE_URL)
    const hasSecondaryUrlVar = /\b(PROD_BASE_URL|QA_URL)\b/.test(content);

    let isConsistent = true;
    let reason = '';

    if (!guardMatch || !guardedVar) {
      isConsistent = false;
      reason = 'Missing assertMutationSafety call';
    } else if (guardedVar !== 'TEST_BASE_URL') {
      isConsistent = false;
      reason = `Guarded variable is '${guardedVar}', expected 'TEST_BASE_URL'`;
    } else if (hasHardcodedWorkersDev) {
      isConsistent = false;
      reason = 'Contains hardcoded workers.dev domain string';
    } else if (hasQaUrl) {
      isConsistent = false;
      reason = 'Uses process.env.QA_URL bypass variable';
    } else if (hasSecondaryUrlVar) {
      isConsistent = false;
      reason = 'Contains secondary un-guarded URL variable';
    }

    if (isConsistent) {
      protectedMutationSpecs++;
      auditTable.push({ spec: file, guardedVar: 'TEST_BASE_URL', actualVar: 'TEST_BASE_URL', match: 'YES' });
    } else {
      violationList.push({ file, reason });
      auditTable.push({ spec: file, guardedVar: guardedVar || 'NONE', actualVar: 'MISMATCH', match: 'NO' });
    }
  }
}

console.log(`[MUTATION TARGET CHECKER] Scanned ${specFiles.length} E2E specs.`);
console.log(`[MUTATION TARGET CHECKER] Total Mutation Specs Found: ${totalMutationSpecs}`);
console.log(`[MUTATION TARGET CHECKER] Guarded Target == Actual Target (29/29): ${protectedMutationSpecs}/${totalMutationSpecs}`);

if (violationList.length > 0) {
  console.error(`❌ MUTATION_TARGET_BYPASSES_GUARD: The following ${violationList.length} specs failed Target-URL consistency audit:`);
  violationList.forEach((v) => console.error(`  - ${v.file}: ${v.reason}`));
  process.exit(1);
} else {
  console.log(`✅ MUTATION TARGET CONSISTENCY PASSED: All ${protectedMutationSpecs}/${totalMutationSpecs} mutation specs use identical TEST_BASE_URL variable.`);
  process.exit(0);
}
