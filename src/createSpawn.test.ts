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
