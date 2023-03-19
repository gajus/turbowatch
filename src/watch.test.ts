import { watch } from './watch';
import { setTimeout } from 'node:timers/promises';
import path from 'path';
import { type Message } from 'roarr';
import * as sinon from 'sinon';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { $ } from 'zx';

$.verbose = false;

const spyRoarr = () => {
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

beforeEach(async () => {
  await $`rm -fr .fixtures`;
  await $`mkdir .fixtures`;
  await $`touch .fixtures/foo`;
});

afterEach(async () => {
  await $`rm -fr .fixtures`;
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

  await $`touch .fixtures/foo`;

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
    await $`touch .fixtures/foo`;
  }

  await setTimeout(1_000);

  expect(onChange.called).toBe(true);

  expect(roarrSpy.getMessages().length < 20).toBe(true);

  await shutdown();
});
