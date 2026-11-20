import { initSentry } from '@shared/sentry/server-init';

import {
  GENERATE_IMAGE_ACTION_NAME,
  INGEST_WEB_CONTENT_ACTION_NAME,
  SEND_CHARACTER_MESSAGE_ACTION_NAME,
  SEND_CHAT_MESSAGE_ACTION_NAME,
  SEND_LEARNING_SCENARIO_MESSAGE_ACTION_NAME,
} from '@/server-action-names';

initSentry({
  aiServerActionNames: [
    GENERATE_IMAGE_ACTION_NAME,
    INGEST_WEB_CONTENT_ACTION_NAME,
    SEND_CHARACTER_MESSAGE_ACTION_NAME,
    SEND_CHAT_MESSAGE_ACTION_NAME,
    SEND_LEARNING_SCENARIO_MESSAGE_ACTION_NAME,
  ],
  serviceName: 'ais-chat-app',
  traceExcludedUrls: ['/api/healthz'],
});
