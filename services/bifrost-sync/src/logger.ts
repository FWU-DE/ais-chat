import { pino } from 'pino';

import { env } from './env';

// Only log fields chosen at the call site. Never log request bodies, headers or error causes.
export const logger = pino({ level: env.logLevel });
