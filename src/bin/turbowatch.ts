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

  const scriptPath = path.resolve(process.cwd(), argv.source as string);

  if (!existsSync(scriptPath)) {
    console.error('%s not found', scriptPath);

    process.exitCode = 1;

    return;
  }

  jiti(__filename)(scriptPath);
};

main();
