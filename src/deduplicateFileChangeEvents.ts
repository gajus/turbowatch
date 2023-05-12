import { type FileChangeEvent } from './types';

export const deduplicateFileChangeEvents = (
  fileChangeEvents: readonly FileChangeEvent[],
): readonly FileChangeEvent[] => {
  const changedFilePaths: string[] = [];

  return fileChangeEvents
    .slice()
    .reverse()
    .filter((event) => {
      if (changedFilePaths.includes(event.filename)) {
        return false;
      }

      changedFilePaths.push(event.filename);

      return true;
    })
    .reverse();
};
