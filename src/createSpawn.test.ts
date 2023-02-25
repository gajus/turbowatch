import {
  createSpawn,
} from './createSpawn';
import {
  expect,
  it,
} from 'vitest';

it('returns outputs', async () => {
  const spawn = createSpawn('foo', null);

  const result = await spawn`echo 'Hello, World!'`;

  expect(String(result?.stdout)).toEqual('Hello, World!\n');
});

it('rejects if process produces an error', async () => {
  const spawn = createSpawn('foo', null);

  await expect(spawn`does-not-exist`).rejects.toThrowError('Program exited with code 127.');
});

const TIMEOUT = 100;

it('terminates spawned process when it receives abort signal', async () => {
  const abortController = new AbortController();

  const spawn = createSpawn('foo', abortController.signal);

  setTimeout(() => {
    void abortController.abort();
  }, 50);

  await spawn`sleep 10`;
}, TIMEOUT);

it('waits for termination', async () => {
  const abortController = new AbortController();

  const spawn = createSpawn('foo', abortController.signal);

  setTimeout(() => {
    void abortController.abort();
  }, 50);

  const start = Date.now();

  await spawn`( trap '' TERM; exec sleep 0.1 )`;

  expect(Date.now() - start).toBeGreaterThan(100);
}, TIMEOUT * 2);
