import { Backend } from './Backend';
import * as chokidar from 'chokidar';

export class Chokidar extends Backend {
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
