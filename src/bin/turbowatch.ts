#!/usr/bin/env node

/* eslint-disable no-console */
/* eslint-disable node/shebang */
/* eslint-disable require-atomic-updates */

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

const resolvePath = (inputPath: string): string | null => {
  let resolvedPath: string | null = null;

  const providedPath = path.resolve(process.cwd(), inputPath);

  const possiblePaths = [providedPath];

  if (path.extname(providedPath) === '') {
    possiblePaths.push(providedPath + '.ts', providedPath + '.js');
  }

  for (const possiblePath of possiblePaths) {
    if (existsSync(possiblePath)) {
      resolvedPath = possiblePath;
    }
  }

  return resolvedPath;
};

const main = async () => {
  const argv = await yargs(hideBin(process.argv))
    .command('$0 [scripts...]', 'Start Turbowatch', (commandYargs) => {
      commandYargs.positional('scripts', {
        array: true,
        default: 'turbowatch.ts',
        describe: 'Script with Turbowatch instructions.',
        type: 'string',
      });
    })
    .parse();

  const scriptPaths = argv.scripts as readonly string[];

  const resolvedScriptPaths: string[] = [];

  for (const scriptPath of scriptPaths) {
    const resolvedPath = resolvePath(scriptPath);

    if (!resolvedPath) {
      console.error('%s not found', scriptPath);

      process.exitCode = 1;

      return;
    }

    resolvedScriptPaths.push(resolvedPath);
  }

  for (const resolvedPath of resolvedScriptPaths) {
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
  }
};

void main();
