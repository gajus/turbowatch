/* eslint-disable canonical/filename-match-regex */

import { FileWatchingBackend } from './FileWatchingBackend';
import fs, { type FSWatcher as NativeFSWatcher } from 'node:fs';

export class FSWatcher extends FileWatchingBackend {
  private fsWatcher: NativeFSWatcher;

  public constructor(project: string) {
    super();

    this.fsWatcher = fs.watch(
      project,
      {
        recursive: true,
      },
      (eventType, filename) => {
        this.emit('change', { filename });
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
