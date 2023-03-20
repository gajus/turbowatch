/* eslint-disable canonical/filename-match-regex */

import { Logger } from '../Logger';
import { ChokidarWatcher } from './ChokidarWatcher';
import { FileWatchingBackend } from './FileWatchingBackend';
import { FSWatcher } from './FSWatcher';
import * as semver from 'semver';

const log = Logger.child({
  namespace: 'TurboWatcher',
});

export class TurboWatcher extends FileWatchingBackend {
  private backend: FileWatchingBackend;

  public constructor(project: string) {
    super();

    if (semver.gte(process.version, '19.1.0')) {
      log.info('using native FSWatcher');
      this.backend = new FSWatcher(project);
    } else {
      log.info('using native ChokidarWatcher');
      this.backend = new ChokidarWatcher(project);
    }

    this.backend.on('ready', () => {
      this.emit('ready');
    });

    this.backend.on('change', (event) => {
      this.emit('change', event);
    });
  }

  public close() {
    return this.backend.close();
  }
}
