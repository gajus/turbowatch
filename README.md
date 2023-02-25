# Watchrow

Extremely fast file change detector and task orchestrator for Node.js.

```ts
import {
  watch,
  type ChangeEvent,
} from 'watchrow';

void watch({
  // Path to the root of the project.
  project: __dirname,
  triggers: [
    {
      // The expression is applied to the list of changed files to generate the set of files
      // that are relevant to this trigger. If no files match, the trigger will not be invoked.
      // https://facebook.github.io/watchman/docs/expr/allof.html
      expression: ['match', '*.ts'],
      // Determines what to do if a new file change is detected while the trigger is executing.
      // If {interruptible: true}, then AbortSignal will abort the current onChange routine.
      // If {interruptible: false}, then Watchrow will wait until the onChange routine completes.
      // Defaults to true.
      interruptible: false,
      // Routine that is executed when file changes are detected.
      onChange: async ({ spawn }: ChangeEvent) => {
        await spawn`tsc`;
        await spawn`tsc-alias`;
      },
    },
  ],
});

/**
 * @property files Describes the list of files that changed.
 * @property first Identifies if this is the first event.
 * @property signal Instance of AbortSignal used to signal when the routine should be aborted.
 * @property spawn Instance of zx bound to AbortSignal.
 */
ChangeEvent;
```

Then simply run the script using `node`.

## Use cases

Watchrow can be used to automate any sort of operations that need to happen in response to files changing, e.g.,

* You can run (and automatically restart) long-running processes (like your Node.js application)
* You can build assets (like Docker images)

## Features

* Restarts long-running applications
* Runs commands concurrently

## Expressions Cheat Sheet

Expressions are used to match files. The most basic expression is [`match`](https://facebook.github.io/watchman/docs/expr/match.html) – it evaluates as true if a glob pattern matches the file, e.g.

Match all files with `*.ts` extension:

```ts
['match', '*.ts', 'basename']
```

Expressions can be combined using [`allof`](https://facebook.github.io/watchman/docs/expr/allof.html) and [`anyof`](https://facebook.github.io/watchman/docs/expr/anyof.html) expressions, e.g.

Match all files with `*.ts` or `*.tsx` extensions:

```ts
[
  'anyof', 
  ['match', '*.ts', 'basename'],
  ['match', '*.tsx', 'basename']
]
```

Finally, [`not`](https://facebook.github.io/watchman/docs/expr/not.html) evaluates as true if the sub-expression evaluated as false, i.e. inverts the sub-expression.

Match all files with `*.ts` extension, but exclude `index.ts`:

```ts
[
  'allof', 
  ['match', '*.ts', 'basename'],
  [
    'not',
    ['match', 'index.ts', 'basename']
  ]
]
```

This is the gist behind Watchman expressions. However, there are many more expressions. Inspect `Expression` type for further guidance or refer to [Watchman documentation](https://facebook.github.io/watchman/docs/install.html).

## Recipes

### Interruptible workflows

> **Note** Watchrow already comes with `zx` bound to the `AbortSignal`. Just use `spawn`. Documentation demonstrates how to implement equivalent functionality.

Implementing interruptible workflows requires that you define `AbortSignal` handler. If you are using [`zx`](https://npmjs.com/zx), such abstraction could look like so:

```ts
import { type ProcessPromise } from 'zx';

const interrupt = async (
  processPromise: ProcessPromise,
  signal: AbortSignal,
) => {
  let aborted = false;

  const kill = () => {
    aborted = true;

    processPromise.kill();
  };

  signal.addEventListener('abort', kill, { once: true });

  try {
    await processPromise;
  } catch (error) {
    if (!aborted) {
      console.log(error);
    }
  }

  signal.removeEventListener('abort', kill);
};
```

which you can then use to kill your scripts, e.g.

```ts
void watch({
  project: __dirname,
  triggers: [
    {
      expression: ['allof', ['match', '*.ts']],
      interruptible: false,
      onChange: async ({ signal }) => {
        return interrupt($`sleep 30`, signal);
      },
    },
  ],
});
```

## FAQ

### Why not use Nodemon?

[Nodemon](https://nodemon.io/) is a popular software to monitor files for changes. However, Watchrow is more performant and more flexible.

Watchrow is based on [Watchman](https://facebook.github.io/watchman/), which has been built to monitor tens of thousands of files with little overhead.

In terms of the API, Watchrow leverages powerful Watchman [expression language](#expressions-cheat-sheet) and [zx](https://github.com/google/zx) `child_process` abstractions to give you granular control over event handling and script execution.

### Why not use Watchman?

You can. However, [Watchman API](https://facebook.github.io/watchman/docs/nodejs.html) and documentation are not particularly developer-friendly.

Watchrow provides comparable functionality to Watchman with a lot simpler API.

### Why not just X --watch?

Many tools provide built-in watch functionality, e.g. `tsc --watch`. However, there are couple of problems with relying on them:

* Running many file watchers is inefficient and is probably draining your laptop's battery faster than you realize. Watchman uses a single server to watch all file changes.
* Native tools do not allow to combine operations, e.g. If your build depends on `tsc` and `tsc-alias`, then you cannot combine them.

Because not all tools provide native `--watch` functionality and because they rarely can be combined even when they do, you end up mixing several different ways of watching the file system. It is confusing and inefficient. Watchrow provides a single abstraction for all use cases.