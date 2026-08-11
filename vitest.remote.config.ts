import { defineConfig } from 'vitest/config';

// These suites send real requests and mutate the QA database. They are kept
// outside the default local/CI test command and must be invoked explicitly.
export default defineConfig({
  test: {
    include: [
      'tests/calendarCountryPermission.test.ts',
      'tests/executeQaVerification.test.ts',
      'tests/projectScheduleShiftCascade.test.ts',
      'tests/workerLeaveScheduleCascade.test.ts',
    ],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
