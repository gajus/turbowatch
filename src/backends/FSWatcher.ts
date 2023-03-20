/* eslint-disable canonical/filename-match-regex */

import { FileWatchingBackend } from './FileWatchingBackend';
import { glob } from 'glob';
import { type FSWatcher as NativeFSWatcher, watch } from 'node:fs';
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';

const findSymlinks = async (project: string) => {
  const filenames = await glob('./**/*', {
    absolute: true,
    cwd: project,
    dot: true,
  });

  const symlinks: Array<{
    realpath: string;
    symlink: string;
  }> = [];

  for (const filename of filenames) {
    const stats = await lstat(filename);

    if (stats.isSymbolicLink()) {
      const fileRealpath = await realpath(filename);

      if (!symlinks.some((symlink) => symlink.symlink === fileRealpath)) {
        symlinks.push({
          realpath: fileRealpath,
          symlink: filename,
        });
      }
    }
  }

  return symlinks;
};

export class FSWatcher extends FileWatchingBackend {
  private fsWatchers: NativeFSWatcher[] = [];

  public constructor(project: string) {
    super();

    // eslint-disable-next-line unicorn/consistent-function-scoping
    const watchPath = (target: string) => {
      return watch(
        target,
        {
          encoding: 'utf8',
          persistent: true,
          recursive: true,
        },
        (eventType, filename) => {
          this.emit('change', { filename: path.resolve(target, filename) });
        },
      );
    };

    this.fsWatchers.push(watchPath(project));

    // TODO detect when a new symlink is added to the project
    // eslint-disable-next-line promise/prefer-await-to-then
    findSymlinks(project).then((symlinks) => {
      for (const symlink of symlinks) {
        this.fsWatchers.push(
          watch(
            symlink.realpath,
            {
              encoding: 'utf8',
              persistent: true,
              recursive: true,
            },
            (eventType, filename) => {
              const absolutePath = path.resolve(symlink.realpath, filename);

              this.emit('change', {
                filename: path.join(
                  symlink.symlink,
                  path.relative(symlink.realpath, absolutePath),
                ),
              });
            },
          ),
        );
      }

      this.emit('ready');
    });
  }

  public async close() {
    for (const fsWatcher of this.fsWatchers) {
      fsWatcher.close();
    }
  }
}
