// scripts/generate-test-inventory.mjs
import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const testsDir = path.join(rootDir, 'tests', 'e2e');
const qaDir = path.join(rootDir, 'qa');

if (!fs.existsSync(qaDir)) {
  fs.mkdirSync(qaDir, { recursive: true });
}

// 1. Read all .spec.ts files from tests/e2e
const allFiles = fs.readdirSync(testsDir)
  .filter((f) => f.endsWith('.spec.ts'))
  .map((f) => `tests/e2e/${f}`)
  .sort();

// 2. Read Release Gate Specs defined in deploy-release.ps1
const releaseScriptPath = path.join(rootDir, 'scripts', 'deploy-release.ps1');
const releaseScriptContent = fs.readFileSync(releaseScriptPath, 'utf-8');

const matches = releaseScriptContent.match(/tests\/e2e\/[a-zA-Z0-9_-]+\.spec\.ts/g) || [];
const releaseGateSpecs = [...new Set(matches)];

// Check duplicates and missing
const duplicates = matches.filter((item, index) => matches.indexOf(item) !== index);
const missingReleaseSpecs = releaseGateSpecs.filter((spec) => !fs.existsSync(path.join(rootDir, spec)));

// 3. Compute excluded
const excludedSpecs = allFiles.filter((file) => !releaseGateSpecs.includes(file));

// 4. Validate invariants
const releaseSet = new Set(releaseGateSpecs);
const excludedSet = new Set(excludedSpecs);
const intersection = [...releaseSet].filter((x) => excludedSet.has(x));

const totalUnique = releaseGateSpecs.length + excludedSpecs.length;
const totalCount = allFiles.length;

if (totalCount !== totalUnique || intersection.length > 0 || duplicates.length > 0 || missingReleaseSpecs.length > 0) {
  console.error('TEST_INVENTORY_MISMATCH:', {
    totalCount,
    totalUnique,
    intersection,
    duplicates,
    missingReleaseSpecs,
  });
  process.exit(1);
}

const inventory = {
  total_specs: totalCount,
  release_gate_specs: releaseGateSpecs.length,
  excluded_specs: excludedSpecs.length,
  duplicates,
  missing_release_specs: missingReleaseSpecs,
  release_specs: releaseGateSpecs,
  excluded: excludedSpecs,
  generated_at: new Date().toISOString(),
};

const outputPath = path.join(qaDir, 'test-inventory.json');
fs.writeFileSync(outputPath, JSON.stringify(inventory, null, 2), 'utf-8');
console.log(`Test inventory generated successfully: ${outputPath}`);
console.log(`Total: ${inventory.total_specs}, Release Gate: ${inventory.release_gate_specs}, Excluded: ${inventory.excluded_specs}`);
