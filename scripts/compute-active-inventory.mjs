// scripts/compute-active-inventory.mjs
import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const qaDir = path.join(rootDir, 'qa');

if (!fs.existsSync(qaDir)) {
  fs.mkdirSync(qaDir, { recursive: true });
}

// 1. Critical 17 specs
const criticalSpecs = [
  'tests/e2e/gantt-inline-content.spec.ts',
  'tests/e2e/task-modal-runtime.spec.ts',
  'tests/e2e/mobile-logo-header.spec.ts',
  'tests/e2e/vietnam-saturday-calendar.spec.ts',
  'tests/e2e/final-hierarchy-and-compact.spec.ts',
  'tests/e2e/mobile-progress-contract.spec.ts',
  'tests/e2e/mobile-week-agenda.spec.ts',
  'tests/e2e/mobile-thirty-day-calendar.spec.ts',
  'tests/e2e/open-api-production-entry.spec.ts',
  'tests/e2e/integration-key-management-ui.spec.ts',
  'tests/e2e/header-all-tab-api-responsive.spec.ts',
  'tests/e2e/project-all-status-tab.spec.ts',
  'tests/e2e/project-overview-name-readability.spec.ts',
  'tests/e2e/today-summary-monthly-completion.spec.ts',
  'tests/e2e/task-group-drag-drop.spec.ts',
  'tests/e2e/completion-integrity-guard.spec.ts',
  'tests/e2e/project-actions-regression.spec.ts',
].sort();

// 2. All 38 ACTIVE specs
const activeSpecs = [
  ...criticalSpecs,
  'tests/e2e/calendar-cross-surface-semantic-consistency.spec.ts',
  'tests/e2e/calendar-real-cross-surface-contract.spec.ts',
  'tests/e2e/calendar-visual-consistency.spec.ts',
  'tests/e2e/desktop-toolbar.spec.ts',
  'tests/e2e/executive-default-all-projects.spec.ts',
  'tests/e2e/existing-entity-rename.spec.ts',
  'tests/e2e/existing-task-edit-schema-regression.spec.ts',
  'tests/e2e/gantt-bar-visibility.spec.ts',
  'tests/e2e/gantt-geometry-alignment.spec.ts',
  'tests/e2e/gantt-sticky-corner-full-height.spec.ts',
  'tests/e2e/gantt-sticky-left-occlusion.spec.ts',
  'tests/e2e/holiday-exclusion.spec.ts',
  'tests/e2e/integration-api-auth.spec.ts',
  'tests/e2e/manual-country-holidays.spec.ts',
  'tests/e2e/multi-assignee-calendar-consistency.spec.ts',
  'tests/e2e/multi-assignees-progress.spec.ts',
  'tests/e2e/project-bar-hatch-layer.spec.ts',
  'tests/e2e/project-overview-control-layout.spec.ts',
  'tests/e2e/scheduler-v2-pic-capacity.spec.ts',
  'tests/e2e/task-modal-persistent-footer.spec.ts',
  'tests/e2e/workforce-allocation-history.spec.ts',
].sort();

// Set subtraction: remaining = active - critical
const criticalSet = new Set(criticalSpecs);
const remainingActive = activeSpecs.filter((spec) => !criticalSet.has(spec));

// Check duplicates and missing
const duplicates = activeSpecs.filter((item, index) => activeSpecs.indexOf(item) !== index);
const missing = activeSpecs.filter((spec) => !fs.existsSync(path.join(rootDir, spec)));

const outputData = {
  active_total: activeSpecs.length,
  critical_already_passed: criticalSpecs.length,
  remaining_to_execute: remainingActive.length,
  duplicates,
  missing,
  critical_specs: criticalSpecs,
  remaining_specs: remainingActive,
  generated_at: new Date().toISOString(),
};

if (outputData.active_total !== 38 || outputData.critical_already_passed !== 17 || outputData.remaining_to_execute !== 21 || duplicates.length > 0 || missing.length > 0) {
  console.error('INVARIANT_CHECK_FAILED:', outputData);
  process.exit(1);
}

const outputPath = path.join(qaDir, 'final-acceptance-active-specs.json');
fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2), 'utf-8');
console.log(`Active inventory generated successfully: ${outputPath}`);
console.log(`Active Total: ${outputData.active_total}, Critical: ${outputData.critical_already_passed}, Remaining: ${outputData.remaining_to_execute}`);
