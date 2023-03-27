import { FileWatchingBackend } from './FileWatchingBackend';
import * as chokidar from 'chokidar';

export class ChokidarWatcher extends FileWatchingBackend {
  private chokidar: chokidar.FSWatcher;

  public constructor(project: string) {
    super();

    this.chokidar = chokidar.watch(project, {
      awaitWriteFinish: false,
      followSymlinks: true,
      ignoreInitial: true,
    });

    this.chokidar.on('ready', () => {
      this.emitReady();

      this.chokidar.on('all', (event, filename) => {
        if (event === 'addDir') {
          return;
        }

        this.emitChange({ filename });
      });
    });
  }

  public close() {
    return this.chokidar.close();
  }
}
