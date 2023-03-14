#!/usr/bin/env node

/* eslint-disable no-console */

import jiti from 'jiti';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';

const main = () => {
  const argv = yargs(hideBin(process.argv))
    .command('$0 [turbowatch.ts]', 'Start Turbowatch', (commandYargs) => {
      commandYargs.positional('turbowatch.ts', {
        alias: 'source',
        default: 'turbowatch.ts',
        describe: 'Script with Turbowatch instructions.',
        type: 'string',
      });
    })
    .parseSync();

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

  jiti(__filename)(resolvedPath);
};

main();
