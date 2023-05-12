/* eslint-disable canonical/filename-match-regex */

import { hashFile } from '../hashFile';
import { isFSWatcherAvailable } from '../isFSWatcherAvailable';
import { Logger } from '../Logger';
import { ChokidarWatcher } from './ChokidarWatcher';
import { FileWatchingBackend } from './FileWatchingBackend';
import { FSWatcher } from './FSWatcher';

const log = Logger.child({
  namespace: 'TurboWatcher',
});

// eslint-disable-next-line node/no-process-env
const { TURBOWATCH_EXPERIMENTAL_FILE_HASH } = process.env;

export class TurboWatcher extends FileWatchingBackend {
  private backend: FileWatchingBackend;

  public constructor(project: string) {
    super();

    if (TURBOWATCH_EXPERIMENTAL_FILE_HASH === 'true') {
      log.warn('using experimental file hashing mechanism');
    }

    if (isFSWatcherAvailable()) {
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
      // This implementation is somewhat problematic, because it hashes all the files,
      // even if those files are not matched by the triggers. We should probably consider
      // moving this logic up to watch.ts, and only hash the files that are matched.
      if (TURBOWATCH_EXPERIMENTAL_FILE_HASH === 'true') {
        // eslint-disable-next-line promise/prefer-await-to-then
        hashFile(event.filename).then((hash) => {
          this.emit('change', {
            ...event,
            hash,
          });
        });
      } else {
        this.emit('change', event);
      }
    });
  }

  public close() {
    return this.backend.close();
  }
}
