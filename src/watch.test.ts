import { watch } from './watch';
import path from 'path';
import * as sinon from 'sinon';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { $ } from 'zx';

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
