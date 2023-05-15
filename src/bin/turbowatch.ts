#!/usr/bin/env node

/* eslint-disable node/shebang */
/* eslint-disable require-atomic-updates */

import { Logger } from '../Logger';
import {
  type TurbowatchConfigurationInput,
  type TurbowatchController,
} from '../types';
import { glob } from 'glob';
import jiti from 'jiti';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';

const log = Logger.child({
  namespace: 'turbowatch',
});

// eslint-disable-next-line node/no-process-env
if (process.env.ROARR_LOG !== 'true') {
  // eslint-disable-next-line no-console
  console.warn(
    '[turbowatch] running turbowatch without logging enabled; set ROARR_LOG=true to enable logging. Install @roarr/cli to pretty-print logs.',
  );
}

const findTurbowatchScript = (inputPath: string): string | null => {
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
  const abortController = new AbortController();

  let terminating = false;

  process.once('SIGINT', () => {
    if (terminating) {
      log.warn('already terminating; ignoring SIGINT');

      return;
    }

    terminating = true;

    log.warn('received SIGINT; gracefully terminating');

    abortController.abort();
  });

  process.once('SIGTERM', () => {
    if (terminating) {
      log.warn('already terminating; ignoring SIGTERM');

      return;
    }

    terminating = true;

    log.warn('received SIGTERM; gracefully terminating');

    abortController.abort();
  });

  const {
    watch,
  }: {
    watch: (
      configurationInput: TurbowatchConfigurationInput,
    ) => Promise<TurbowatchController>;
  } = jiti(__filename)('../watch');

  const argv = await yargs(hideBin(process.argv))
    .command('$0 [patterns...]', 'Start Turbowatch', (commandYargs) => {
      commandYargs.positional('patterns', {
        array: true,
        default: ['turbowatch.ts'],
        describe:
          'Script with Turbowatch instructions. Can provide multiple. It can also be a glob pattern, e.g. **/turbowatch.ts',
        type: 'string',
      });
    })
    .parse();

  const patterns = argv.patterns as readonly string[];

  const scriptPaths: string[] = [];

  for (const pattern of patterns) {
    if (pattern.includes('*')) {
      scriptPaths.push(...(await glob(pattern)));
    } else {
      scriptPaths.push(pattern);
    }
  }

  const resolvedScriptPaths: string[] = [];

  for (const scriptPath of scriptPaths) {
    const resolvedPath = findTurbowatchScript(scriptPath);

    if (!resolvedPath) {
      log.error('%s not found', scriptPath);

      process.exitCode = 1;

      return;
    }

    resolvedScriptPaths.push(resolvedPath);
  }

  for (const resolvedPath of resolvedScriptPaths) {
    const turbowatchConfiguration = jiti(__filename)(resolvedPath)
      .default as TurbowatchConfigurationInput;

    if (typeof turbowatchConfiguration?.Watcher !== 'function') {
      log.error(
        'Expected user script to export an instance of TurbowatchController',
      );

      process.exitCode = 1;

      return;
    }

    await watch({
      abortController,
      cwd: path.dirname(resolvedPath),
      ...turbowatchConfiguration,
    });
  }
};

void main();
