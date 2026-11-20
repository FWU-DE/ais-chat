// Assigns free ports to chat-bot, admin and api by rewriting PORT and the sibling URLs in apps/*/.env.local.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const listen = () =>
  new Promise((resolve) => {
    const server = createServer();
    server.listen(0, () => resolve(server));
  });
const servers = await Promise.all([listen(), listen(), listen()]);
const [chatBot, admin, api] = servers.map((server) => server.address().port);
await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));

const entries = {
  'chat-bot': { PORT: chatBot, API_URL: `http://localhost:${api}` },
  admin: {
    PORT: admin,
    API_URL: `http://localhost:${api}`,
    CHAT_BOT_BASE_URL: `http://localhost:${chatBot}`,
  },
  api: { PORT: api },
};

for (const [app, values] of Object.entries(entries)) {
  const file = path.join(root, 'apps', app, '.env.local');
  let content = existsSync(file) ? readFileSync(file, 'utf8') : '';
  for (const [key, value] of Object.entries(values)) {
    const line = new RegExp(`^(\\s*(?:export\\s+)?${key}\\s*=\\s*).*$`, 'm');
    const old = content.match(line)?.[0];
    if (old === undefined) {
      content += `${content && !content.endsWith('\n') ? '\n' : ''}${key}=${value}\n`;
    } else {
      content = content.replace(line, `$1${value}`);
    }
    console.log(
      `apps/${app}/.env.local: ${key} ${old?.split('=')[1]?.trim() ?? '(unset)'} -> ${value}`,
    );
  }
  writeFileSync(file, content);
}
console.log(`ports: chat-bot ${chatBot}, admin ${admin}, api ${api}`);
