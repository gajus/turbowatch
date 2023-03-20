/* eslint-disable canonical/filename-match-regex */

import { FileWatchingBackend } from './FileWatchingBackend';
import fs, { type FSWatcher as NativeFSWatcher } from 'node:fs';
import path from 'node:path';

export class FSWatcher extends FileWatchingBackend {
  private fsWatcher: NativeFSWatcher;

  public constructor(project: string) {
    super();

    this.fsWatcher = fs.watch(
      project,
      {
        encoding: 'utf8',
        persistent: true,
        recursive: true,
      },
      (eventType, filename) => {
        this.emit('change', { filename: path.resolve(project, filename) });
      },
    );

    setImmediate(() => {
      this.emit('ready');
    });
  }

  public async close() {
    this.fsWatcher.close();
  }
}
