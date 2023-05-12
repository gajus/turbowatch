import { hashFile } from './hashFile';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

it('hashes file', async () => {
  await expect(hashFile(resolve(__dirname, 'Logger.ts'))).resolves.toBe(
    '8f8bf20d9e97101d36989916146db88c825b7922',
  );
});

it('resolves null if file cannot be read', async () => {
  await expect(hashFile(resolve(__dirname, 'does-not-exist.ts'))).resolves.toBe(
    null,
  );
});
