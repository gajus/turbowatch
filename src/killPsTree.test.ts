import { killPsTree } from './killPsTree';
import { exec } from 'node:child_process';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { test } from 'vitest';

test('kills a good process tree', async () => {
  const childProcess = exec(
    `node ${join(__dirname, '__fixtures__/killPsTree/goodTree/a.js')}`,
  );

  if (!childProcess.pid) {
    throw new Error('Expected child process to have a pid');
  }

  await setTimeout(500);

  await killPsTree(childProcess.pid);
});

test('kills a bad process tree', async () => {
  const childProcess = exec(
    `node ${join(__dirname, '__fixtures__/killPsTree/badTree/a.js')}`,
  );

  if (!childProcess.pid) {
    throw new Error('Expected child process to have a pid');
  }

  await setTimeout(500);

  await killPsTree(childProcess.pid, 1_000);
});
