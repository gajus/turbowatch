/* eslint-disable no-console */

import { Logger } from '../Logger';
import { type TurbowatchController } from '../types';
import jiti from 'jiti';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';

const log = Logger.child({
  namespace: 'turbowatch',
});

const main = async () => {
  const argv = await yargs(hideBin(process.argv))
    .command('$0 [turbowatch.ts]', 'Start Turbowatch', (commandYargs) => {
      commandYargs.positional('turbowatch.ts', {
        alias: 'source',
        default: 'turbowatch.ts',
        describe: 'Script with Turbowatch instructions.',
        type: 'string',
      });
    })
    .parse();

  let resolvedPath: string | undefined;

  const providedPath = path.resolve(process.cwd(), argv.source as string);

  const possiblePaths = [providedPath];

  if (path.extname(providedPath) === '') {
    possiblePaths.push(providedPath + '.ts', providedPath + '.js');
  }

  for (const possiblePath of possiblePaths) {
    if (existsSync(possiblePath)) {
      resolvedPath = possiblePath;
    }
  }

  if (!resolvedPath) {
    console.error('%s not found', providedPath);

    process.exitCode = 1;

    return;
  }

  const userScript = jiti(__filename)(resolvedPath)
    .default as Promise<TurbowatchController>;

  if (typeof userScript?.then !== 'function') {
    console.error(
      'Expected user script to export an instance of TurbowatchController',
    );

    process.exitCode = 1;

    return;
  }

  const turbowatchController = await userScript;

  process.once('SIGINT', () => {
    log.warn('received SIGINT; gracefully terminating');

    void turbowatchController.shutdown();
  });
};

void main();
