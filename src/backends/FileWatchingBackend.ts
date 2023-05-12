/* eslint-disable @typescript-eslint/consistent-type-definitions */
/* eslint-disable @typescript-eslint/method-signature-style */

import { type FileChangeEvent } from '../types';
import { EventEmitter } from 'node:events';
import path from 'node:path';

interface BackendEventEmitter {
  on(name: 'ready', listener: () => void): this;
  on(name: 'change', listener: (event: FileChangeEvent) => void): this;
}

export abstract class FileWatchingBackend
  extends EventEmitter
  implements BackendEventEmitter
{
  public constructor() {
    super();
  }

  public abstract close(): Promise<void>;

  protected emitReady(): void {
    this.emit('ready');
  }

  protected emitChange(event: FileChangeEvent): void {
    if (!path.isAbsolute(event.filename)) {
      throw new Error('Watchers must emit absolute paths');
    }

    this.emit('change', {
      filename: event.filename,
    });
  }
}
