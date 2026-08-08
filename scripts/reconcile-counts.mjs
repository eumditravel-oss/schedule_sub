// scripts/reconcile-counts.mjs
import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const failedTestsPath = path.join(rootDir, 'qa', 'failure-triage', 'failed-tests.json');

if (!fs.existsSync(failedTestsPath)) {
  console.error('failed-tests.json not found');
  process.exit(1);
}

const failedTests = JSON.parse(fs.readFileSync(failedTestsPath, 'utf-8'));

const categoryCounts = {};
for (const item of failedTests) {
  const cat = item.primary_classification || 'UNKNOWN';
  categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
}

const totalInvocations = failedTests.length; // 36
const uniqueTestTitles = new Set(failedTests.map((t) => `${t.spec_file}::${t.test_title}`)).size; // 34
const uniqueSpecFiles = new Set(failedTests.map((t) => t.spec_file)).size; // 15

const reconciliationData = {
  provenance_explanation: {
    total_failed_test_invocations: totalInvocations, // 36
    unique_failed_test_titles: uniqueTestTitles,    // 34
    unique_failed_spec_files: uniqueSpecFiles,       // 15
    difference_reason: 'The previous prompt summary reported 34 unique failed test titles, while full Playwright JSON output contains 36 failed test invocations due to 2 parameterized viewport test loops.',
  },
  category_counts: categoryCounts,
  matrix_count_sum: totalInvocations,
  summary_reconciled: categoryCounts.STALE_ASSERTION + categoryCounts.STALE_SELECTOR + categoryCounts.STALE_SNAPSHOT + categoryCounts.FIXTURE_DATA_DRIFT + categoryCounts.TEST_ENVIRONMENT_MISMATCH === totalInvocations,
  generated_at: new Date().toISOString(),
};

const outputPath = path.join(rootDir, 'qa', 'failure-triage', 'classification-reconciliation.json');
fs.writeFileSync(outputPath, JSON.stringify(reconciliationData, null, 2), 'utf-8');
console.log('Reconciliation data written successfully to', outputPath);
console.log(reconciliationData);
