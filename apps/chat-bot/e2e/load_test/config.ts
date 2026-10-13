export const BASE_URL = __ENV.LOADTEST_BASE_URL || 'https://app-staging.ais-chat.schule';
//export const BASE_URL = 'http://localhost:3000';

export const WAIT_TIMES_IN_MS = {
  PAGE_ELEMENT_TIMEOUT: 10_000, // Maximum time to wait for an element to appear
  AI_MESSAGE_TIMEOUT: 30_000, // Maximum time to wait for a chat message to appear
  FILE_UPLOAD_TIMEOUT: 30_000, // Time to wait for file uploads
  NAVIGATION_TIMEOUT: 30_000, // Time to wait for navigation
} as const;

export const LLM_MODELS = [
  { id: 'gpt-5-nano', displayName: 'GPT-5 nano' },
  { id: 'gpt-4o-mini', displayName: 'GPT-4o-mini' },
  { id: 'meta-llama/Meta-Llama-3.1-8B-Instruct', displayName: 'Llama-3.1-8B' },
];

export const SELECTORS = {
  MESSAGE_INPUT: '[data-testid="chat-input"]',
  SEND_BUTTON: 'button[aria-label="Nachricht abschicken"]',
  AI_MESSAGE: '[aria-label="assistant message 1"]',
  RELOAD_BUTTON: '[data-testid="regenerate-message-button"]',
  PROFILE_BUTTON: '[aria-label="profileDropdown"]',
  DROPDOWN_WRAPPER: 'div[data-radix-popper-content-wrapper]',
} as const;

export const SCREENSHOT_FOLDERS = {
  SUCCESS_RESULTS: './e2e/load_test/success-results',
  ERROR_RESULTS: './e2e/load_test/error-results',
};

export const HEADLESS_BROWSER_OPTIONS = {
  cloud: {
    distribution: {
      distributionLabel1: { loadZone: 'amazon:de:frankfurt', percent: 100 },
    },
  },
  scenarios: {
    ui_with_browser: {
      executor: 'constant-vus',
      vus: 100,
      duration: '5m', // Run long enough for debugging
      options: {
        browser: {
          type: 'chromium',
        },
      },
    },
  },
  thresholds: {
    checks: ['rate>0.95'], // 95% of checks must pass
    http_req_duration: ['p(95)<10000'], // 95% of requests must complete within 10s
    browser_web_vital_fcp: ['p(95)<3000'], // First Contentful Paint
    browser_web_vital_lcp: ['p(95)<5000'], // Largest Contentful Paint
  },
};

export const VISIBLE_BROWSER_OPTIONS = {
  cloud: {
    distribution: {
      distributionLabel1: { loadZone: 'amazon:de:frankfurt', percent: 100 },
    },
  },
  scenarios: {
    ui_test: {
      executor: 'constant-vus',
      vus: 1, // Only run 1 user to see the UI
      duration: '20m', // Run long enough for debugging
      options: {
        browser: {
          type: 'chromium',
        },
      },
    },
  },
};
