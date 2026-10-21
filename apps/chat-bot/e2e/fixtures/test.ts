// Shared `test`/`expect` for UI specs: adds axe-core accessibility scanning and
// code coverage collection on top of Playwright's own fixtures, both reported
// by playwright-smart-reporter. Specs that don't use the `page` fixture (the
// "api test" project) import from '@playwright/test' directly instead.
import type {
  PlaywrightTestArgs,
  PlaywrightTestOptions,
  PlaywrightWorkerArgs,
  PlaywrightWorkerOptions,
  TestType,
} from '@playwright/test';
import { withCoverage } from 'playwright-smart-reporter/coverage';
import { test as base } from 'playwright-smart-reporter/accessibility';

export const test: TestType<
  PlaywrightTestArgs & PlaywrightTestOptions & { smartReporterA11y: unknown },
  PlaywrightWorkerArgs & PlaywrightWorkerOptions
> = withCoverage(base);
export { expect } from '@playwright/test';
