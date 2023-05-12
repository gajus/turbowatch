import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Iterates up the directory tree from the given path until it finds a directory
 * containing the given file.
 */
export const findNearestDirectory = async (
  fileName: string,
  startPath: string,
): Promise<string | null> => {
  let currentPath = startPath;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const targetPath = path.join(currentPath, fileName);

    try {
      await fs.access(targetPath, fs.constants.F_OK);
    } catch {
      const nextPath = path.resolve(currentPath, '..');

      if (nextPath === currentPath) {
        break;
      }

      currentPath = nextPath;

      continue;
    }

    return targetPath;
  }

  return null;
};
