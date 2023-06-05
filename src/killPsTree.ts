import { Logger } from './Logger';
import findProcess from 'find-process';
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
    hangingPids.map((pid) => {
      return new Promise((resolve) => {
        const interval = setInterval(async () => {
          if (hitTimeout) {
            clearInterval(interval);

            resolve(false);

            return;
          }

          const processes = await findProcess('pid', pid);

          if (processes.length === 0) {
            hangingPids = hangingPids.filter(
              (hangingPid) => hangingPid !== pid,
            );

            clearInterval(interval);

            resolve(true);
          }
        }, 100);
      });
    }),
  );

  clearTimeout(timeoutId);

  log.debug('all processes terminated');
};
