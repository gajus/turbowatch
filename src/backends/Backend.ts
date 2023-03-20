/* eslint-disable @typescript-eslint/consistent-type-definitions */
/* eslint-disable @typescript-eslint/method-signature-style */

import { type FileChangeEvent } from '../types';
import { EventEmitter } from 'node:events';

interface BackendEventEmitter {
  on(event: 'ready', listener: () => void): this;
  on(event: 'change', listener: ({ filename }: FileChangeEvent) => void): this;
}

export abstract class Backend
  extends EventEmitter
  implements BackendEventEmitter
{
  public constructor() {
    super();
  }

  public abstract close(): Promise<void>;
}
