import { FileWatchingBackend } from './FileWatchingBackend';
import * as chokidar from 'chokidar';

export class ChokidarWatcher extends FileWatchingBackend {
  private chokidar: chokidar.FSWatcher;

  public constructor(project: string) {
    super();

    this.chokidar = chokidar.watch(project);

    this.chokidar.on('ready', () => {
      this.emit('ready');
    });

    this.chokidar.on('all', (event, filename) => {
      this.emit('change', { filename });
    });
  }

  public close() {
    return this.chokidar.close();
  }
}
