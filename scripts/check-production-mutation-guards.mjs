// scripts/check-production-mutation-guards.mjs
// Static checker to ensure all E2E spec files performing mutations enforce productionMutationGuard
import fs from 'fs';
import path from 'path';

const E2E_DIR = path.join(process.cwd(), 'tests', 'e2e');
const specFiles = fs.readdirSync(E2E_DIR).filter((f) => f.endsWith('.spec.ts'));

let totalMutationSpecs = 0;
let protectedMutationSpecs = 0;
const missingGuardFiles = [];
const protectedGuardFiles = [];

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
    const hasImport = content.includes('productionMutationGuard');
    const hasCall = content.includes('assertMutationSafety');

    if (hasImport && hasCall) {
      protectedMutationSpecs++;
      protectedGuardFiles.push(file);
    } else {
      missingGuardFiles.push(file);
    }
  }
}

console.log(`[MUTATION GUARD CHECKER] Scanned ${specFiles.length} E2E specs.`);
console.log(`[MUTATION GUARD CHECKER] Total Mutation Specs Found: ${totalMutationSpecs}`);
console.log(`[MUTATION GUARD CHECKER] Protected Specs: ${protectedMutationSpecs}`);
console.log(`[MUTATION GUARD CHECKER] Missing Specs: ${missingGuardFiles.length}`);

if (missingGuardFiles.length > 0) {
  console.error(`❌ MUTATION_GUARD_MISSING: The following ${missingGuardFiles.length} mutation specs do NOT enforce productionMutationGuard:`);
  missingGuardFiles.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
} else {
  console.log(`✅ ALL ${protectedMutationSpecs} mutation specs are fully protected by productionMutationGuard.`);
  process.exit(0);
}
