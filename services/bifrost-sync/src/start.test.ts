import { expect, test } from 'vitest';

import { start } from './start';

const listen = { port: 0, host: '127.0.0.1' };

test('recovers before the port opens', async () => {
  const calls: string[] = [];
  await start(
    {
      recover: () => {
        calls.push('recover');
        return Promise.resolve();
      },
    },
    {
      listen: () => {
        calls.push('listen');
        return Promise.resolve('');
      },
    },
    listen,
  );

  expect(calls).toEqual(['recover', 'listen']);
});

test('does not open the port when recovery fails', async () => {
  let listened = false;
  await expect(
    start(
      { recover: () => Promise.reject(new Error('state unreadable')) },
      {
        listen: () => {
          listened = true;
          return Promise.resolve('');
        },
      },
      listen,
    ),
  ).rejects.toThrow('state unreadable');

  expect(listened).toBe(false);
});
