import { watch } from './watch';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { type Message } from 'roarr';
import * as sinon from 'sinon';
import { afterEach, beforeEach, expect, it } from 'vitest';

const spyRoarr = () => {
  // eslint-disable-next-line node/no-process-env
  const { ROARR_LOG } = process.env;

  if (ROARR_LOG !== 'true') {
    throw new Error('ROARR_LOG must be set to "true"');
  }

  const messages: Message[] = [];

  globalThis.ROARR.write = (message) => {
    const payload = JSON.parse(message);

    messages.push(payload);
  };

  return {
    getMessages: () => {
      return messages;
    },
  };
};

const fixturesPath = path.resolve(__dirname, '../.fixtures');

beforeEach(async () => {
  await fs.rm(fixturesPath, {
    force: true,
    recursive: true,
  });

  await fs.mkdir(fixturesPath);
  await fs.writeFile(path.join(fixturesPath, 'foo'), '');
});

afterEach(async () => {
  await fs.rm(fixturesPath, {
    force: true,
    recursive: true,
  });
});

it('detects file change', async () => {
  const onChange = sinon.stub();

  const { shutdown } = await watch({
    debounce: {
      wait: 100,
    },
    project: path.resolve(__dirname, '../.fixtures'),
    triggers: [
      {
        expression: ['match', 'foo', 'basename'],
        initialRun: false,
        name: 'foo',
        onChange,
      },
    ],
  });

  await fs.writeFile(path.join(fixturesPath, 'foo'), '');

  await setTimeout(1_000);

  expect(onChange.called).toBe(true);

  await shutdown();
});

// https://github.com/gajus/turbowatch/issues/17
it('does not log every file change', async () => {
  const onChange = sinon.stub();

  const roarrSpy = spyRoarr();

  const { shutdown } = await watch({
    debounce: {
      wait: 100,
    },
    project: path.resolve(__dirname, '../.fixtures'),
    triggers: [
      {
        expression: ['match', 'foo', 'basename'],
        initialRun: false,
        name: 'foo',
        onChange,
      },
    ],
  });

  for (let index = 0; index++ < 100; ) {
    await fs.writeFile(path.join(fixturesPath, 'foo'), '');
  }

  await setTimeout(1_000);

  expect(onChange.called).toBe(true);

  expect(roarrSpy.getMessages().length < 20).toBe(true);

  await shutdown();
});
