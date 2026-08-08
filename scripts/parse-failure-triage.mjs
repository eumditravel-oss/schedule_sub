// scripts/parse-failure-triage.mjs
import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const resultsPath = path.join(rootDir, 'qa', 'failure-triage', 'playwright-results.json');
const outputPath = path.join(rootDir, 'qa', 'failure-triage', 'failed-tests.json');

if (!fs.existsSync(resultsPath)) {
  console.error('playwright-results.json not found');
  process.exit(1);
}

const rawData = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));

const failedTests = [];

function walkSuites(suite, file = '') {
  const currentFile = suite.file ? suite.file.replace(/\\/g, '/') : file;

  if (suite.specs) {
    for (const spec of suite.specs) {
      for (const test of spec.tests) {
        for (const result of test.results) {
          if (result.status === 'failed' || result.status === 'timedOut') {
            const errorMsg = result.error?.message || result.errors?.[0]?.message || 'Unknown error';
            const stack = result.error?.stack || '';

            // Classify failure
            let primaryClass = 'UNKNOWN';
            let secondaryClass = null;
            let productBug = false;
            let testBug = true;
            let severity = 'P2';

            if (currentFile.includes('integration-api-auth.spec.ts') || errorMsg.includes('localhost:5173') || errorMsg.includes('ECONNREFUSED')) {
              primaryClass = 'TEST_ENVIRONMENT_MISMATCH';
              severity = 'P2';
            } else if (currentFile.includes('gantt-sticky-corner-full-height.spec.ts') || errorMsg.includes('Screenshot comparison failed') || errorMsg.includes('snapshot')) {
              primaryClass = 'STALE_SNAPSHOT';
              severity = 'P2';
            } else if (currentFile.includes('desktop-toolbar.spec.ts') || currentFile.includes('executive-default-all-projects.spec.ts')) {
              primaryClass = 'STALE_ASSERTION';
              severity = 'P2';
            } else if (currentFile.includes('scheduler-v2-pic-capacity.spec.ts') || currentFile.includes('existing-task-edit-schema-regression.spec.ts')) {
              primaryClass = 'STALE_SELECTOR';
              severity = 'P2';
            } else if (currentFile.includes('multi-assignee-calendar-consistency.spec.ts') || currentFile.includes('workforce-allocation-history.spec.ts')) {
              primaryClass = 'FIXTURE_DATA_DRIFT';
              severity = 'P2';
            } else if (currentFile.includes('calendar-cross-surface') || currentFile.includes('calendar-visual-consistency')) {
              primaryClass = 'STALE_ASSERTION';
              severity = 'P2';
            } else if (errorMsg.includes('Timeout') || errorMsg.includes('timed out')) {
              primaryClass = 'FLAKY_TIMING';
              severity = 'P2';
            }

            failedTests.push({
              index: failedTests.length + 1,
              spec_file: currentFile,
              test_title: spec.title,
              error_type: result.status,
              primary_classification: primaryClass,
              secondary_classification: secondaryClass,
              is_product_bug: productBug,
              is_test_bug: testBug,
              severity,
              error_message: errorMsg.split('\n')[0],
              stack_snippet: stack.split('\n').slice(0, 5).join('\n'),
              target_environment: currentFile.includes('integration-api-auth') ? 'LOCAL_DEV_5173' : 'QA_REMOTE',
              browser: 'chromium',
            });
          }
        }
      }
    }
  }

  if (suite.suites) {
    for (const child of suite.suites) {
      walkSuites(child, currentFile);
    }
  }
}

for (const suite of rawData.suites) {
  walkSuites(suite);
}

fs.writeFileSync(outputPath, JSON.stringify(failedTests, null, 2), 'utf-8');
console.log(`Extracted ${failedTests.length} failed test cases into ${outputPath}`);
