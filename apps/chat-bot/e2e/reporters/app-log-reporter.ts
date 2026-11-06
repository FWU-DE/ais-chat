import fs from 'node:fs';

import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';

/**
 * Attaches server- and container-side logs to each Playwright test by time-slicing
 * timestamped log files against the test's execution window.
 *
 * The app log is prefixed with UTC ISO seconds by the CI workflow; container logs carry
 * "<service> | <RFC3339Nano timestamp>" lines from `docker compose logs --timestamps`.
 * Because app timestamps are second-resolution and tests run in parallel, slices are
 * approximate: TOLERANCE_MS pads the window and adjacent/concurrent tests may share lines.
 *
 * Log file paths come from the APP_LOG_FILE / CONTAINER_LOG_FILE env vars; a source is
 * skipped when its var is unset (e.g. local runs), and missing files are skipped silently.
 */

const TOLERANCE_MS = 1500;

type Source = { name: string; file: string };

const SOURCES: Source[] = [
  { name: 'app-server-log', file: process.env.APP_LOG_FILE },
  { name: 'container-logs', file: process.env.CONTAINER_LOG_FILE },
].filter((source): source is Source => source.file !== undefined);

/**
 * Parses the timestamp of a log line. Handles two formats:
 *  - app log:       "<timestamp> <message>" (timestamp is the leading token)
 *  - container log: "<service> | <timestamp> <message>" from `docker compose logs
 *    --timestamps` (the leading token is the service name, not the timestamp)
 * Returns null when no timestamp can be parsed (e.g. a stack-trace line).
 */
function parseLeadingTimestamp(line: string): number | null {
  const parseFirstToken = (text: string): number | null => {
    const spaceIndex = text.indexOf(' ');
    const token = spaceIndex === -1 ? text : text.slice(0, spaceIndex);
    if (token.length === 0) return null;
    const ms = Date.parse(token);
    return Number.isNaN(ms) ? null : ms;
  };

  // Strip an optional `docker compose logs` prefix ("<service> | ") before the timestamp,
  // but only when the remainder actually starts with a valid date, so app-log lines that
  // happen to contain a literal " | " are not misread.
  const composeMatch = line.match(/^\S.*?\s+\|\s+(.*)$/);
  if (composeMatch?.[1] !== undefined) {
    const afterPrefix = parseFirstToken(composeMatch[1]);
    if (afterPrefix !== null) return afterPrefix;
  }

  return parseFirstToken(line);
}

/**
 * Returns the log lines whose timestamp falls within [start, end].
 * Lines without a parseable timestamp inherit the previous line's timestamp,
 * keeping multi-line entries (e.g. stack traces) attached to their header line.
 */
function sliceByWindow(content: string, start: number, end: number): string {
  const result: string[] = [];
  let lastTs: number | null = null;

  for (const line of content.split('\n')) {
    const ts: number | null = parseLeadingTimestamp(line) ?? lastTs;
    if (ts !== null) lastTs = ts;
    if (ts !== null && ts >= start && ts <= end) {
      result.push(line);
    }
  }

  return result.join('\n');
}

export default class AppLogReporter implements Reporter {
  onTestEnd(_test: TestCase, result: TestResult): void {
    if (!result.startTime) return;

    const start = result.startTime.getTime() - TOLERANCE_MS;
    const end = result.startTime.getTime() + result.duration + TOLERANCE_MS;

    for (const { name, file } of SOURCES) {
      let content: string;
      try {
        content = fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }

      const slice = sliceByWindow(content, start, end);
      if (slice.trim().length === 0) continue;

      result.attachments.push({
        name,
        contentType: 'text/plain',
        body: Buffer.from(slice, 'utf8'),
      });
    }
  }
}
