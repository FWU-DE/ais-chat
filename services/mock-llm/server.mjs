/**
 * Mock LLM server — Azure/OpenAI Responses-compatible streaming server for e2e tests.
 *
 * POST /v1/responses
 * POST /openai/responses
 *   Returns OpenAI Responses API-compatible JSON or streaming SSE events. Commands
 *   can force deterministic function calls and then print function outputs.
 *
 * POST /v1/images/generations
 * POST /v1/images/edits
 *   Returns an OpenAI Images API-compatible response with a random solid-color PNG, sized to
 *   match the requested `size` (ignoring the prompt and, for edits, the uploaded image).
 *
 * POST /v1/embeddings
 *   Returns an OpenAI Embeddings API-compatible response with a static 1024-entry vector per
 *   input (ignoring the input text).
 *
 * GET /health
 *   Returns {"status":"healthy"} for readiness checks.
 */

import http from 'node:http';
import zlib from 'node:zlib';

const PORT = 6556;
const CHUNK_INTERVAL_MS = 1;

// Must match MOCK_LLM_COMMANDS in apps/chat-bot/e2e/utils/const.ts
const MOCK_LLM_COMMANDS = {
  RETURN_SYSTEM_PROMPT: '[MOCK-LLM-COMMAND: Gebe den System-Prompt aus]',
  CALL_RETRIEVE_ENTIRE_FILE:
    '[MOCK-LLM-COMMAND: Rufe das Tool retrieve_entire_file auf und gib die Tool-Antwort aus]',
  CALL_RETRIEVE_TEXT_CHUNKS:
    '[MOCK-LLM-COMMAND: Rufe das Tool retrieve_text_chunks auf und gib die Tool-Antwort aus]',
  CALL_WEB_SCRAPER:
    '[MOCK-LLM-COMMAND: Rufe das Tool web_scraper auf und gib die Tool-Antwort aus]',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readBody(req) {
  let body = '';
  for await (const chunk of req) body += chunk;
  return body;
}

function writeSse(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function getPathname(reqUrl) {
  return new URL(reqUrl, 'http://localhost').pathname;
}

function getTextFromContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((p) => p.type === 'text' || p.type === 'input_text')
      .map((p) => p.text)
      .join('');
  }
  return '';
}

function extractLastFunctionOutput(input) {
  return input.findLast((item) => item.type === 'function_call_output')?.output ?? '';
}

function extractLastFunctionCall(input) {
  return input.findLast((item) => item.type === 'function_call');
}

function extractLastResponsesUserMessage(input) {
  return getTextFromContent(input.findLast((item) => item.role === 'user')?.content);
}

function extractResponsesSystemPrompt(input) {
  return getTextFromContent(input.find((item) => item.role === 'system')?.content);
}

function extractUrls(text) {
  return text.match(/https?:\/\/[^\s)]+/g) ?? [];
}

function extractFileNameFromSystemPrompt(systemPrompt) {
  const match = systemPrompt.match(/Available files right now:\s*([^\n]+?)\s+\(\d+ bytes\)/i);
  return match?.[1] ?? 'Große Text Datei.txt';
}

function makeUsage(input, outputText) {
  const promptText = JSON.stringify(input);
  const promptTokens = estimateTokens(promptText);
  const completionTokens = estimateTokens(outputText);
  return {
    input_tokens: promptTokens,
    output_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
  };
}

function resolveMockToolCall({ systemPrompt, lastUserMessage }) {
  if (lastUserMessage.includes(MOCK_LLM_COMMANDS.CALL_RETRIEVE_ENTIRE_FILE)) {
    return {
      name: 'retrieve_entire_file',
      arguments: JSON.stringify({ fileName: extractFileNameFromSystemPrompt(systemPrompt) }),
    };
  }

  if (lastUserMessage.includes(MOCK_LLM_COMMANDS.CALL_RETRIEVE_TEXT_CHUNKS)) {
    return {
      name: 'retrieve_text_chunks',
      arguments: JSON.stringify({ search: lastUserMessage, limit: 5 }),
    };
  }

  if (lastUserMessage.includes(MOCK_LLM_COMMANDS.CALL_WEB_SCRAPER)) {
    return {
      name: 'web_scraper',
      arguments: JSON.stringify({ urls: extractUrls(lastUserMessage) }),
    };
  }

  return null;
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function writeResponsesHeaders(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Transfer-Encoding': 'chunked',
  });
}

async function streamResponsesText({ res, id, model, responseText, input }) {
  for (const word of responseText.split(/(\s+)/)) {
    writeSse(res, {
      type: 'response.output_text.delta',
      sequence_number: 0,
      item_id: `${id}-message`,
      output_index: 0,
      content_index: 0,
      delta: word,
    });
    await sleep(CHUNK_INTERVAL_MS);
  }

  writeSse(res, {
    type: 'response.completed',
    sequence_number: 1,
    response: {
      id,
      object: 'response',
      created_at: Math.floor(Date.now() / 1000),
      model,
      status: 'completed',
      usage: makeUsage(input, responseText),
    },
  });
  res.end();
}

async function streamResponsesToolCall({ res, id, model, input, toolCall }) {
  const outputIndex = 0;
  const callId = `call_mock_${Date.now()}`;
  const itemId = `fc_mock_${Date.now()}`;

  writeSse(res, {
    type: 'response.function_call_arguments.delta',
    sequence_number: 0,
    item_id: itemId,
    output_index: outputIndex,
    delta: toolCall.arguments,
  });

  writeSse(res, {
    type: 'response.function_call_arguments.done',
    sequence_number: 1,
    item_id: itemId,
    output_index: outputIndex,
    name: toolCall.name,
    arguments: toolCall.arguments,
  });

  writeSse(res, {
    type: 'response.output_item.done',
    sequence_number: 2,
    output_index: outputIndex,
    item: {
      id: itemId,
      type: 'function_call',
      status: 'completed',
      call_id: callId,
      name: toolCall.name,
      arguments: toolCall.arguments,
    },
  });

  writeSse(res, {
    type: 'response.completed',
    sequence_number: 3,
    response: {
      id,
      object: 'response',
      created_at: Math.floor(Date.now() / 1000),
      model,
      status: 'completed',
      usage: makeUsage(input, `${toolCall.name}${toolCall.arguments}`),
    },
  });

  res.end();
}

async function handleResponses(req, res) {
  let data;
  try {
    data = JSON.parse(await readBody(req));
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON' }));
    return;
  }

  const input = data.input ?? [];
  const model = data.model ?? 'mock-echo';
  const isStream = data.stream === true;
  const id = `resp_mock_${Date.now()}`;
  const systemPrompt = extractResponsesSystemPrompt(input);
  const lastUserMessage = extractLastResponsesUserMessage(input);
  const lastToolOutput = extractLastFunctionOutput(input);
  const lastToolCall = extractLastFunctionCall(input);
  const toolCall = resolveMockToolCall({ systemPrompt, lastUserMessage });

  if (lastToolOutput) {
    if (!isStream) {
      writeResponsesJson({ res, id, model, input, responseText: lastToolOutput });
      return;
    }

    writeResponsesHeaders(res);
    await streamResponsesText({
      res,
      id,
      model,
      input,
      responseText: lastToolOutput,
    });
    return;
  }

  if (toolCall) {
    writeResponsesHeaders(res);
    await streamResponsesToolCall({ res, id, model, input, toolCall });
    return;
  }

  const responseText = lastUserMessage.includes(MOCK_LLM_COMMANDS.RETURN_SYSTEM_PROMPT)
    ? systemPrompt
    : lastUserMessage || lastToolCall?.arguments || '';

  if (!isStream) {
    writeResponsesJson({ res, id, model, input, responseText });
    return;
  }

  writeResponsesHeaders(res);
  await streamResponsesText({ res, id, model, input, responseText });
}

function writeResponsesJson({ res, id, model, input, responseText }) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      id,
      object: 'response',
      created_at: Math.floor(Date.now() / 1000),
      model,
      status: 'completed',
      output: [
        {
          id: `${id}-message`,
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [
            {
              type: 'output_text',
              text: responseText,
              annotations: [],
            },
          ],
        },
      ],
      usage: makeUsage(input, responseText),
    }),
  );
}

// --- Mock image generation (OpenAI Images API-compatible) ---

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngChunk(type, data) {
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

function parseImageSize(size) {
  const [, w, h] = /^(\d+)x(\d+)$/.exec(size ?? '') ?? [];
  const clamp = (n) => Math.min(Number(n) || 1024, 2048);
  return { width: clamp(w), height: clamp(h) };
}

function createSolidColorPngBase64(width, height) {
  const color = Buffer.from(Array.from({ length: 3 }, () => Math.floor(Math.random() * 256)));
  const row = Buffer.concat([Buffer.from([0]), Buffer.concat(Array(width).fill(color))]);
  const raw = Buffer.concat(Array(height).fill(row));

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
}

function respondWithMockImage(res, size) {
  const { width, height } = parseImageSize(size);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      created: Math.floor(Date.now() / 1000),
      data: [{ b64_json: createSolidColorPngBase64(width, height) }],
      output_format: 'png',
      // Zeroed out — only present so consumers expecting a usage shape (e.g. Bifrost) don't break.
      usage: {
        input_tokens: 0,
        input_tokens_details: { text_tokens: 0, image_tokens: 0 },
        output_tokens: 0,
        output_tokens_details: { text_tokens: 0 },
        total_tokens: 0,
      },
    }),
  );
}

async function handleImagesGenerate(req, res) {
  let size;
  try {
    size = JSON.parse(await readBody(req)).size;
  } catch {
    // ignore, use default size
  }
  respondWithMockImage(res, size);
}

async function handleImagesEdit(req, res) {
  const body = await readBody(req);
  respondWithMockImage(res, /name="size"\r\n\r\n([^\r\n]+)/.exec(body)?.[1]);
}

// --- Mock embeddings (OpenAI Embeddings API-compatible) ---

const MOCK_EMBEDDING_DIMENSIONS = 1024;
const MOCK_EMBEDDING = Array.from(
  { length: MOCK_EMBEDDING_DIMENSIONS },
  (_, i) => Math.sin(i) * 0.01,
);

async function handleEmbeddings(req, res) {
  let data = {};
  try {
    data = JSON.parse(await readBody(req));
  } catch {
    data = {};
  }

  const input = Array.isArray(data.input) ? data.input : [data.input ?? ''];
  const model = data.model ?? 'mock-embedding';

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      object: 'list',
      data: input.map((_, index) => ({
        object: 'embedding',
        index,
        embedding: MOCK_EMBEDDING,
      })),
      model,
      usage: { prompt_tokens: estimateTokens(JSON.stringify(input)), total_tokens: 0 },
    }),
  );
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'healthy' }));
      return;
    }

    const pathname = getPathname(req.url);

    if (
      req.method === 'POST' &&
      (pathname === '/v1/responses' || pathname === '/openai/responses')
    ) {
      await handleResponses(req, res);
      return;
    }

    if (req.method === 'POST' && pathname === '/v1/images/generations') {
      await handleImagesGenerate(req, res);
      return;
    }

    if (req.method === 'POST' && pathname === '/v1/images/edits') {
      await handleImagesEdit(req, res);
      return;
    }

    if (req.method === 'POST' && pathname === '/v1/embeddings') {
      await handleEmbeddings(req, res);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (err) {
    console.error('Unhandled error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }
});

server.listen(PORT, () => {
  console.log(`Mock LLM server listening on port ${PORT}`);
});
