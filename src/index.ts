export { ChokidarWatcher } from './backends/ChokidarWatcher';
export { FileWatchingBackend } from './backends/FileWatchingBackend';
export { FSWatcher } from './backends/FSWatcher';
export { TurboWatcher } from './backends/TurboWatcher';
export { defineConfig } from './defineConfig';
export { type ChangeEvent, type Expression, type TriggerInput } from './types';
export { watch } from './watch';
export { type ProcessPromise } from 'zx';
