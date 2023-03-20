import { isFSWatcherAvailable } from '../isFSWatcherAvailable';
import { ChokidarWatcher } from './ChokidarWatcher';
import { type FileWatchingBackend } from './FileWatchingBackend';
import { FSWatcher } from './FSWatcher';
import { TurboWatcher } from './TurboWatcher';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import * as sinon from 'sinon';
import { beforeEach, expect, it } from 'vitest';

const fixturesPath = path.resolve(__dirname, '.fixtures');

beforeEach(async () => {
  await fs.rm(fixturesPath, {
    force: true,
    recursive: true,
  });

  await fs.mkdir(fixturesPath);
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
  {
    name: 'Turbo',
    Watcher: TurboWatcher,
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

    await setTimeout(100);

    await fs.writeFile(path.join(fixturesPath, 'foo'), '');

    await setTimeout(100);

    expect(
      onChange.calledWith({
        filename: path.join(fixturesPath, 'foo'),
      }),
    ).toBe(true);

    await watcher.close();
  });

  it('[' + name + '] detects changes to a file that is replaced', async () => {
    const watcher = new Watcher(fixturesPath);

    await waitForReady(watcher);

    const onChange = sinon.stub();

    watcher.on('change', onChange);

    await setTimeout(100);

    await fs.writeFile(path.join(fixturesPath, 'foo'), '');

    await setTimeout(100);

    await fs.unlink(path.join(fixturesPath, 'foo'));

    await setTimeout(100);

    await fs.writeFile(path.join(fixturesPath, 'foo'), '');

    await setTimeout(100);

    expect(onChange.callCount).toBeGreaterThanOrEqual(3);

    await watcher.close();
  });

  it('[' + name + '] detects symlink change', async () => {
    await fs.mkdir(path.resolve(fixturesPath, 'foo'));

    await fs.writeFile(path.join(fixturesPath, 'bar'), '');

    const symlink = path.join(fixturesPath, 'foo', 'bar');

    await fs.symlink(path.join(fixturesPath, 'bar'), symlink);

    const watcher = new Watcher(path.resolve(fixturesPath, 'foo'));

    await waitForReady(watcher);

    const onChange = sinon.stub();

    watcher.on('change', onChange);

    await setTimeout(100);

    await fs.writeFile(symlink, '');

    await setTimeout(100);

    expect(
      onChange.calledWith({
        filename: path.join(fixturesPath, 'foo', 'bar'),
      }),
    ).toBe(true);

    await watcher.close();
  });
}
