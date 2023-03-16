import { watch } from './watch';
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
  const abortController = new AbortController();

  const onChange = sinon.stub().callsFake(async () => {
    abortController.abort();
  });

  await watch({
    abortSignal: abortController.signal,
    onReady: async () => {
      await $`touch .fixtures/foo`;
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

  expect(onChange.called).toBe(true);
});

// https://github.com/gajus/turbowatch/issues/17
it('does not log every file change', async () => {
  const abortController = new AbortController();

  const onChange = sinon.stub().callsFake(async () => {
    abortController.abort();
  });

  const roarrSpy = spyRoarr();

  await watch({
    abortSignal: abortController.signal,
    onReady: async () => {
      for (let index = 0; index++ < 100; ) {
        await $`touch .fixtures/foo`;
      }
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

  expect(onChange.called).toBe(true);

  expect(roarrSpy.getMessages().length < 20).toBe(true);
});
