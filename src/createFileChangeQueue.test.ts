import { createFileChangeQueue } from './createFileChangeQueue';
import { type Subscription } from './types';
import { mkdir, rmdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import * as sinon from 'sinon';
import { beforeEach, expect, test } from 'vitest';

const FIXTURES_DIRECTORY = join(__dirname, '.createFileChangeQueueFixtures');

beforeEach(async () => {
  try {
    await rmdir(FIXTURES_DIRECTORY, {
      recursive: true,
    });
  } catch {
    //
  }

  await mkdir(FIXTURES_DIRECTORY);
});

test('deduplicates triggers', async () => {
  const fooFile = join(FIXTURES_DIRECTORY, 'foo');

  await writeFile(fooFile, 'foo');

  const abortController = new AbortController();

  const trigger = sinon.stub().resolves(null);

  const subscription: Subscription = {
    activeTask: null,
    expression: ['match', '*'],
    initialRun: false,
    persistent: false,
    teardown: async () => {},
    trigger,
  };

  const fileChangeQueue = createFileChangeQueue({
    abortSignal: abortController.signal,
    project: FIXTURES_DIRECTORY,
    subscriptions: [subscription],
    userDebounce: {
      wait: 100,
    },
  });

  fileChangeQueue.trigger({
    filename: fooFile,
    hash: 'bar',
  });

  fileChangeQueue.trigger({
    filename: fooFile,
    hash: 'baz',
  });

  await setTimeout(200);

  expect(trigger.callCount).toBe(1);

  expect(trigger.firstCall.args[0]).toEqual([
    {
      filename: fooFile,
      hash: 'baz',
    },
  ]);
});
