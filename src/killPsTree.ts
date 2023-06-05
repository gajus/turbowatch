import { Logger } from './Logger';
import findProcess from 'find-process';
import { setTimeout as delay } from 'node:timers/promises';
import pidTree from 'pidtree';

const log = Logger.child({
  namespace: 'killPsTree',
});

export const killPsTree = async (
  rootPid: number,
  gracefulTimeout: number = 30_000,
) => {
  const childPids = await pidTree(rootPid);

  const pids = [rootPid, ...childPids];

  for (const pid of pids) {
    process.kill(pid, 'SIGTERM');
  }

  let hangingPids = [...pids];

  let hitTimeout = false;

  const timeoutId = setTimeout(() => {
    hitTimeout = true;

    log.debug({ hangingPids }, 'sending SIGKILL to processes...');

    for (const pid of hangingPids) {
      process.kill(pid, 'SIGKILL');
    }
  }, gracefulTimeout);

  await Promise.all(
    hangingPids.map(async (pid) => {
      // eslint-disable-next-line no-unmodified-loop-condition
      while (!hitTimeout) {
        const processes = await findProcess('pid', pid);

        if (processes.length === 0) {
          hangingPids = hangingPids.filter((hangingPid) => hangingPid !== pid);

          break;
        }

        await delay(100);
      }
    }),
  );

  clearTimeout(timeoutId);

  log.debug('all processes terminated');
};
