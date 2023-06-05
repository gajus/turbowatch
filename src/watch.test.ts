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

const fixturesPath = path.resolve(__dirname, '.fixtures');

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
    project: fixturesPath,
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

it('ignores file change events if the file hash is the same', async () => {
  const onChange = sinon.stub();

  const { shutdown } = await watch({
    debounce: {
      wait: 100,
    },
    project: fixturesPath,
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

  await fs.writeFile(path.join(fixturesPath, 'foo'), '');

  await setTimeout(1_000);

  expect(onChange.callCount).toBe(1);

  await shutdown();
});

// While desirable, at the moment this is not possible to implement.
// Implementing this would require to index all files when the watch starts.
it.skip('ignores file change events if the file hash is the same; file existed before watch started', async () => {
  const onChange = sinon.stub();

  await fs.writeFile(path.join(fixturesPath, 'foo'), '');

  const { shutdown } = await watch({
    debounce: {
      wait: 100,
    },
    project: fixturesPath,
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

  expect(onChange.callCount).toBe(0);

  await shutdown();
});

// https://github.com/gajus/turbowatch/issues/17
// Not clear why this is failing in CI/CD.
it.skip('does not log every file change', async () => {
  const onChange = sinon.stub();

  const roarrSpy = spyRoarr();

  const { shutdown } = await watch({
    debounce: {
      wait: 100,
    },
    project: fixturesPath,
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

  expect(roarrSpy.getMessages().length).toBeLessThan(20);

  await shutdown();
});

it('executes the initial run (persistent)', async () => {
  const onChange = sinon.stub();

  const { shutdown } = await watch({
    debounce: {
      wait: 100,
    },
    project: fixturesPath,
    triggers: [
      {
        expression: ['match', 'foo', 'basename'],
        name: 'foo',
        onChange,
        persistent: true,
      },
    ],
  });

  expect(onChange.called).toBe(true);

  await shutdown();
});

it('executes the initial run (non-persistent)', async () => {
  const onChange = sinon.stub();

  const { shutdown } = await watch({
    debounce: {
      wait: 100,
    },
    project: fixturesPath,
    triggers: [
      {
        expression: ['match', 'foo', 'basename'],
        name: 'foo',
        onChange,
        persistent: false,
      },
    ],
  });

  expect(onChange.called).toBe(true);

  await shutdown();
});
