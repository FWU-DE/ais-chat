// Shared `test`/`expect` for UI specs: adds code coverage collection on top of
// Playwright's own fixtures, reported by playwright-smart-reporter.
import { test as base } from '@playwright/test';
import { withCoverage } from 'playwright-smart-reporter/coverage';

export const test = withCoverage(base);
export { expect } from '@playwright/test';
