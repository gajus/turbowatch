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
      expression: ['match', '*.ts', 'basename'],
      // Determines what to do if a new file change is detected while the trigger is executing.
      // If {interruptible: true}, then AbortSignal will abort the current onChange routine.
      // If {interruptible: false}, then Watchrow will wait until the onChange routine completes.
      // Defaults to true.
      interruptible: false,
      // Name of the trigger. Used for debugging
      // Must match /^[a-z0-9-_]+$/ pattern and must be unique.
      name: 'build',
      // Routine that is executed when file changes are detected.
      onChange: async ({ spawn }: ChangeEvent) => {
        await spawn`tsc`;
        await spawn`tsc-alias`;
      },
    },
  ],
});

/**
 * @property attempt Attempt number (starting with 0) indicating if trigger was retried.
 * @property files Describes the list of files that changed.
 * @property first Identifies if this is the first event.
 * @property signal Instance of AbortSignal used to signal when the routine should be aborted.
 * @property spawn Instance of zx bound to AbortSignal.
 */
ChangeEvent;
```

Then simply run the script using `node`.

## Motivation

To have a single tool for watching files for changes and orchestrating all build tasks.

## Use Cases

Watchrow can be used to automate any sort of operations that need to happen in response to files changing, e.g.,

* You can run (and automatically restart) long-running processes (like your Node.js application)
* You can build assets (like Docker images)

## `spawn`

The `spawn` function that is exposed by `ChangeEvent` is used to evaluate shell commands. Behind the scenes it uses [zx](https://github.com/google/zx). The reason Watchrow abstracts `zx` is to enable auto-termination of child-processes when triggers are configured to be `interruptible`.

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

### Retrying failing triggers

Retries are configured by passing a `retry` property to the trigger configuration.

```ts
/**
 * @property factor The exponential factor to use. Default is 2.
 * @property maxTimeout The maximum number of milliseconds between two retries. Default is Infinity.
 * @property minTimeout The number of milliseconds before starting the first retry. Default is 1000.
 * @property retries The maximum amount of times to retry the operation. Default is 10. Seting this to 1 means do it once, then retry it once.
 */
type Retry = {
  factor?: number,
  maxTimeout?: number,
  minTimeout?: number,
  retries?: number,
}
```

The default configuration will retry a failing trigger up to 10 times. Retries can be disabled entirely by setting `{ retries: 0 }`, e.g.,

```ts
{
  expression: ['match', '*.ts', 'basename'],
  onChange: async ({ spawn }: ChangeEvent) => {
    await spawn`tsc`;
  },
  retry: {
    retries: 0,
  },
},
```

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
      name: 'sleep',
      onChange: async ({ signal }) => {
        await interrupt($`sleep 30`, signal);
      },
    },
  ],
});
```

### Logging

Watchrow uses [Roarr](https://github.com/gajus/roarr) logger.

Export `ROARR_LOG=true` environment variable to enable log printing to `stdout`.

Use [@roarr/cli](https://github.com/gajus/roarr-cli) to pretty-print logs.

```bash
tsx watchrow.ts | roarr
```

## FAQ

### Why not use Nodemon?

[Nodemon](https://nodemon.io/) is a popular software to monitor files for changes. However, Watchrow is more performant and more flexible.

Watchrow is based on [Watchman](https://facebook.github.io/watchman/), which has been built to monitor tens of thousands of files with little overhead.

In terms of the API, Watchrow leverages powerful Watchman [expression language](#expressions-cheat-sheet) and [zx](https://github.com/google/zx) `child_process` abstractions to give you granular control over event handling and script execution.

### Why not use Watchman?

You can. However, [Watchman API](https://facebook.github.io/watchman/docs/nodejs.html) and documentation are not particularly developer-friendly.

Watchrow provides comparable functionality to Watchman with a lot simpler API.

### Why not use X --watch?

Many tools provide built-in watch functionality, e.g. `tsc --watch`. However, there are couple of problems with relying on them:

* Running many file watchers is inefficient and is probably draining your laptop's battery faster than you realize. Watchman uses a single server to watch all file changes.
* Native tools do not allow to combine operations, e.g. If your build depends on `tsc` and `tsc-alias`, then you cannot combine them.

Because not all tools provide native `--watch` functionality and because they rarely can be combined even when they do, you end up mixing several different ways of watching the file system. It is confusing and inefficient. Watchrow provides a single abstraction for all use cases.

### Why not concurrently?

I have [seen](https://github.com/justkey007/tsc-alias#add-it-to-your-build-scripts-in-packagejson) [concurrently](https://github.com/open-cli-tools/concurrently) used to "chain" watch operations such as:

```bash
concurrently "tsc -w" "tsc-alias -w"
```

While this might work by brute-force, it will produce unexpected results as the order of execution is not guaranteed.

If you are using Watchrow, simply execute one command after the other in the trigger workflow, e.g.

```ts
async ({ spawn }: ChangeEvent) => {
  await spawn`tsc`;
  await spawn`tsc-alias`;
},
```