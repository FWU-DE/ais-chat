import * as Sentry from '@sentry/nextjs';
import { isDevelopment } from '@shared/utils/isDevelopment';

import { env } from './env';

const logLevelOrder = ['fatal', 'error', 'warning', 'log', 'info', 'debug'] as const;
const logLevels = logLevelOrder.slice(
  0,
  1 + logLevelOrder.indexOf(env.NEXT_PUBLIC_SENTRY_LOG_LEVEL),
);

// Write logs to stdout in development, or when explicitly enabled (e.g. e2e CI) so
// prod builds can still surface logs without changing NODE_ENV. LOG_TO_STDOUT is a
// server-only env var, so guard the access to avoid throwing in client bundles.
const logToStdout = isDevelopment() || (typeof window === 'undefined' && env.LOG_TO_STDOUT);

export function logMessage(
  message: string,
  level: Sentry.SeverityLevel,
  extra?: Record<string, unknown>,
) {
  if (logLevels.includes(level)) {
    Sentry.captureMessage(message, { level, extra });
  }

  if (logToStdout) {
    // if `extra` arg is not provided, don't pass it to console.log; otherwise "undefined" will be logged
    const args = extra === undefined ? [] : [extra];
    console.log(`[${level.toUpperCase()}] ${message}`, ...args);
  }
}

export function logDebug(message: string, extra?: Record<string, unknown>) {
  logMessage(message, 'debug', extra);
}

export function logInfo(message: string, extra?: Record<string, unknown>) {
  logMessage(message, 'info', extra);
}

export function logWarning(message: string, extra?: Record<string, unknown>) {
  logMessage(message, 'warning', extra);
}

export function logError(message: string, error?: unknown, extra?: Record<string, unknown>) {
  if (error instanceof Error) {
    // The error class name will be used as issue title in sentry, therefore passing the message as additional data
    Sentry.captureException(error, { level: 'error', extra: { message, ...extra } });
  } else {
    Sentry.captureMessage(message, { level: 'error', extra: { error, ...extra } });
  }

  if (logToStdout) {
    const args = extra === undefined ? [] : [extra];
    console.log(`[ERROR] ${message}`, error, ...args);
  }
}
