import { deduplicateFileChangeEvents } from './deduplicateFileChangeEvents';
import { expect, it } from 'vitest';

it('keeps only the latest entry of a file change', async () => {
  expect(
    deduplicateFileChangeEvents([
      {
        filename: '/foo',
        hash: '1',
      },
      {
        filename: '/foo',
        hash: '2',
      },
      {
        filename: '/foo',
        hash: '3',
      },
    ]),
  ).toEqual([
    {
      filename: '/foo',
      hash: '3',
    },
  ]);
});
