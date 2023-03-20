import { isFSWatcherAvailable } from '../isFSWatcherAvailable';
import { ChokidarWatcher } from './ChokidarWatcher';
import { type FileWatchingBackend } from './FileWatchingBackend';
import { FSWatcher } from './FSWatcher';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import * as sinon from 'sinon';
import { afterEach, beforeEach, expect, it } from 'vitest';

const fixturesPath = path.resolve(__dirname, '.fixtures');

beforeEach(async () => {
  await fs.rm(fixturesPath, {
    force: true,
    recursive: true,
  });

  await fs.mkdir(fixturesPath);
});

afterEach(async () => {
  await fs.rm(fixturesPath, {
    force: true,
    recursive: true,
  });
});

const waitForReady = (watcher: FileWatchingBackend) => {
  return new Promise((resolve) => {
    watcher.on('ready', () => {
      resolve(null);
    });
  });
};

const backends = [
  {
    name: 'Chokidar',
    Watcher: ChokidarWatcher,
  },
  {
    name: 'FS',
    Watcher: FSWatcher,
  },
];

for (const { Watcher, name } of backends) {
  if (isFSWatcherAvailable() === false && Watcher === FSWatcher) {
    continue;
  }

  it('[' + name + '] detects file change', async () => {
    const watcher = new Watcher(fixturesPath);

    await waitForReady(watcher);

    const onChange = sinon.stub();

    watcher.on('change', onChange);

    await fs.writeFile(path.join(fixturesPath, 'foo'), '');

    await setTimeout(1_000);

    expect(onChange.called).toBe(true);

    expect(onChange.firstCall.args[0].filename).toBe(
      path.join(fixturesPath, 'foo'),
    );
  });
}
