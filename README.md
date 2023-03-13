# Turbowatch 🏎

Extremely fast file change detector and task orchestrator for Node.js.

If you ever wanted something like [Nodemon](https://nodemon.io/) but more capable, then you are at the right place.

Refer to recipes:

* [Rebuilding assets when file changes are detected](#rebuilding-assets-when-file-changes-are-detected)
* [Restarting server when file changes are detected](#restarting-server-when-file-changes-are-detected)
* [Retrying failing triggers](#retrying-failing-triggers)
* [Gracefully terminating Turbowatch](#gracefully-terminating-turbowatch)
* [Handling the `AbortSignal`](#handling-the-abortsignal)
* [Tearing down project](#tearing-down-project)
* [Throttling `spawn` output](#throttling-spawn-output)

||Turbowatch|Nodemon|
|---|---|---|
|Node.js interface (sriptable)|✅|❌<sup>1</sup>|
|Graceful termination (teardown)|✅|❌<sup>2</sup>|
|Scriptable child processes (zx)|✅|❌|
|Retries|✅|❌|
|Debounce|✅|❌|
|Interruptible workflows|✅|❌|
|Concurrent workflows|✅|❌|
|Log grouping|✅|❌|
|Works with long-running processes|✅|✅|
|Works with build utilities and REPLs|✅|✅|
|Watch specific files or directories|✅|✅|
|Ignoring specific files or directories|✅|✅|
|Open source and available|✅|✅|

<sup><sup>1</sup> Undocumented</sup><br>
<sup><sup>2</sup> Nodemon only provides the ability to [send a custom signal](https://github.com/remy/nodemon#gracefully-reloading-down-your-script) to the worker.</sup><br>

## API

Turbowatch [defaults](#recipes) are a good choice for most projects. However, Turbowatch has _many_ options that you should be familiar with for advance use cases.

```ts
import {
  watch,
  type ChangeEvent,
} from 'turbowatch';

void watch({
  // AbortController used to gracefully terminate the service.
  // If none is provided, then Turbowatch will gracefully terminate
  // the service when it receives SIGINT.
  abortSignal: new AbortController().signal,
  // The base directory under which all files are matched.
  // Note: This is different from the "root project" (https://github.com/gajus/turbowatch#project-root).
  project: __dirname,
  triggers: [
    {
      // Expression match files based on name, file size, modification date, and other criteria.
      // https://github.com/gajus/turbowatch#expressions-cheat-sheet
      expression: [
        'anyof',
        ['match', '*.ts', 'basename'],
        ['match', '*.tsx', 'basename'],
      ],
      // Debounces trigger by 100 milliseconds.
      // This is the default as it is often desirable to wait for several changes before re-running the trigger.
      // Provide { debounce: { wait: 0 } } to disable debounce.
      debounce: {
        leading: false,
        wait: 100,
      },
      // Determines what to do if a new file change is detected while the trigger is executing.
      // If {interruptible: true}, then AbortSignal will abort the current onChange routine.
      // If {interruptible: false}, then Turbowatch will wait until the onChange routine completes.
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
      // Routine that is executed when shutdown signal is received.
      onTeardown: async ({ spawn }) => {
        await spawn`rm -fr ./dist`;
      },
      // Label a task as persistent if it is a long-running process, such as a dev server or --watch mode.
      persistent: false,
      // Retry a task if it fails. Otherwise, watch program will throw an error if trigger fails.
      retry: {
        retries: 5,
      },
    },
  ],
});
```

## Project root

A project is the logical root of a set of related files in a filesystem tree. [Watchman](#why-not-use-watchman) uses it to consolidate watches.

By default, this will be the first path that has a `.git` directory. However, it can be overridden using [`.watchmanconfig`](https://facebook.github.io/watchman/docs/config.html).

### Rationale

> With a proliferation of tools that wish to take advantage of filesystem watching at different locations in a filesystem tree, it is possible and likely for those tools to establish multiple overlapping watches.
>
> Most systems have a finite limit on the number of directories that can be watched effectively; when that limit is exceeded the performance and reliability of filesystem watching is degraded, sometimes to the point that it ceases to function.
>
> It is therefore desirable to avoid this situation and consolidate the filesystem watches. Watchman offers the `watch-project` command to allow clients to opt-in to the watch consolidation behavior described below.

– https://facebook.github.io/watchman/docs/cmd/watch-project.html

## Motivation

To have a single tool for watching files for changes and orchestrating all build tasks.

## Use Cases

Turbowatch can be used to automate any sort of operations that need to happen in response to files changing, e.g.,

* You can run (and automatically restart) long-running processes (like your Node.js application)
* You can build assets (like Docker images)

## `spawn`

The `spawn` function that is exposed by `ChangeEvent` is used to evaluate shell commands. Behind the scenes it uses [zx](https://github.com/google/zx). The reason Turbowatch abstracts `zx` is to enable auto-termination of child-processes when triggers are configured to be `interruptible`.

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

### Rebuilding assets when file changes are detected

```ts
import { watch } from 'turbowatch';

void watch({
  project: __dirname,
  triggers: [
    {
      expression: ['match', '*.ts', 'basename'],
      name: 'build',
      onChange: async ({ spawn }) => {
        await spawn`tsc`;
        await spawn`tsc-alias`;
      },
    },
  ],
});
```

### Restarting server when file changes are detected

```ts
import { watch } from 'turbowatch';

void watch({
  project: __dirname,
  triggers: [
    {
      expression: [
        'anyof',
        ['match', '*.ts', 'basename'],
        ['match', '*.graphql', 'basename'],
      ],
      // Because of this setting, Turbowatch will kill the processes that spawn starts
      // when it detects changes when it detects a change.
      interruptible: true,
      name: 'start-server',
      onChange: async ({ spawn }) => {
        await spawn`tsx ./src/bin/wait.ts`;
        await spawn`tsx ./src/bin/server.ts`;
      },
    },
  ],
});
```

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

### Gracefully terminating Turbowatch

`AbortController` is used to gracefully terminate Turbowatch.

If none is provided, then Turbowatch will gracefully terminate the service when it receives [SIGINT](https://nodejs.org/api/process.html#signal-events) signal.

```ts
const abortController = new AbortController();

void watch({
  abortSignal: abortController.signal,
  project: __dirname,
  triggers: [
    {
      name: 'test',
      expression: ['match', '*', 'basename'],
      onChange: async ({ spawn }) => {
        // `sleep 60` will receive `SIGTERM` as soon as `abortController.abort()` is called.
        await spawn`sleep 60`;
      },
    }
  ],
});

// SIGINT is the signal sent when we press Ctrl+C
process.once('SIGINT', () => {
  abortController.abort();
});
```

The abort signal will propagate to all `onChange` handlers. The processes that were initiated using `spawn` will receive `SIGTERM` signal.

### Handling the `AbortSignal`

Workflow might be interrupted in two scenarios:

* when Turbowatch is being gracefully shutdown
* when routine is marked as `interruptible` and a new file change is detected

Implementing interruptible workflows requires that you define `AbortSignal` handler. If you are using [`zx`](https://npmjs.com/zx), such abstraction could look like so:

> **Note** Turbowatch already comes with [`zx`](https://npmjs.com/zx) bound to the `AbortSignal`. Just use `spawn`. Documentation demonstrates how to implement equivalent functionality.

```ts
import { type ProcessPromise } from 'zx';

const interrupt = async (
  processPromise: ProcessPromise,
  abortSignal: AbortSignal,
) => {
  let aborted = false;

  const kill = () => {
    aborted = true;

    processPromise.kill();
  };

  abortSignal.addEventListener('abort', kill, { once: true });

  try {
    await processPromise;
  } catch (error) {
    if (!aborted) {
      console.log(error);
    }
  }

  abortSignal.removeEventListener('abort', kill);
};
```

which you can then use to kill your scripts, e.g.

```ts
void watch({
  project: __dirname,
  triggers: [
    {
      expression: ['match', '*.ts', 'basename'],
      interruptible: false,
      name: 'sleep',
      onChange: async ({ abortSignal }) => {
        await interrupt($`sleep 30`, abortSignal);
      },
    },
  ],
});
```

### Tearing down project

`onTeardown` is going to be called when Turbowatch is gracefully terminated. Use it to "clean up" the project if necessary.

> **Warning** There is no timeout for `onTeardown`.

```ts
import { watch } from 'turbowatch';

const abortController = new AbortController();

void watch({
  abortSignal: abortController.signal,
  project: __dirname,
  triggers: [
    {
      expression: ['match', '*.ts', 'basename'],
      name: 'build',
      onChange: async ({ spawn }) => {
        await spawn`tsc`;
      },
      onTeardown: async () => {
        await spawn`rm -fr ./dist`;
      },
    },
  ],
});

process.once('SIGINT', () => {
  abortController.abort();
});
```

### Throttling `spawn` output

When multiple processes are sending logs in parallel, the log stream might be hard to read, e.g.

```yaml
redis:dev: 973191cf > #5 sha256:7f65636102fd1f499092cb075baa95784488c0bbc3e0abff2a6d853109e4a948 4.19MB / 9.60MB 22.3s
api:dev: a1e4c6a7 > [18:48:37.171] 765ms debug @utilities #waitFor: Waiting for database to be ready...
redis:dev: 973191cf > #5 sha256:d01ec855d06e16385fb33f299d9cc6eb303ea04378d0eea3a75d74e26c6e6bb9 0B / 1.39MB 22.7s
api:dev: a1e4c6a7 > [18:48:37.225]  54ms debug @utilities #waitFor: Waiting for Redis to be ready...
worker:dev: 2fb02d72 > [18:48:37.313]  88ms debug @utilities #waitFor: Waiting for database to be ready...
redis:dev: 973191cf > #5 sha256:7f65636102fd1f499092cb075baa95784488c0bbc3e0abff2a6d853109e4a948 5.24MB / 9.60MB 22.9s
worker:dev: 2fb02d72 > [18:48:37.408]  95ms debug @utilities #waitFor: Waiting for Redis to be ready...
redis:dev: 973191cf > #5 sha256:7f65636102fd1f499092cb075baa95784488c0bbc3e0abff2a6d853109e4a948 6.29MB / 9.60MB 23.7s
api:dev: a1e4c6a7 > [18:48:38.172] 764ms debug @utilities #waitFor: Waiting for database to be ready...
api:dev: a1e4c6a7 > [18:48:38.227]  55ms debug @utilities #waitFor: Waiting for Redis to be ready...
```

In this example, `redis`, `api` and `worker` processes produce logs at almost the exact same time causing the log stream to switch between outputting from a different process every other line. This makes it hard to read the logs.

By default, Turbowatch throttles log output to at most once a second, producing a lot more easier to follow log output:

```yaml
redis:dev: 973191cf > #5 sha256:7f65636102fd1f499092cb075baa95784488c0bbc3e0abff2a6d853109e4a948 4.19MB / 9.60MB 22.3s
redis:dev: 973191cf > #5 sha256:d01ec855d06e16385fb33f299d9cc6eb303ea04378d0eea3a75d74e26c6e6bb9 0B / 1.39MB 22.7s
redis:dev: 973191cf > #5 sha256:7f65636102fd1f499092cb075baa95784488c0bbc3e0abff2a6d853109e4a948 5.24MB / 9.60MB 22.9s
redis:dev: 973191cf > #5 sha256:7f65636102fd1f499092cb075baa95784488c0bbc3e0abff2a6d853109e4a948 6.29MB / 9.60MB 23.7s
api:dev: a1e4c6a7 > [18:48:37.171] 765ms debug @utilities #waitFor: Waiting for database to be ready...
api:dev: a1e4c6a7 > [18:48:37.225]  54ms debug @utilities #waitFor: Waiting for Redis to be ready...
api:dev: a1e4c6a7 > [18:48:38.172] 764ms debug @utilities #waitFor: Waiting for database to be ready...
api:dev: a1e4c6a7 > [18:48:38.227]  55ms debug @utilities #waitFor: Waiting for Redis to be ready...
worker:dev: 2fb02d72 > [18:48:37.313]  88ms debug @utilities #waitFor: Waiting for database to be ready...
worker:dev: 2fb02d72 > [18:48:37.408]  95ms debug @utilities #waitFor: Waiting for Redis to be ready...
```

However, this means that some logs might come out of order. To disable this feature, set `{ throttleOutput: { delay: 0 } }`.

### Logging

Turbowatch uses [Roarr](https://github.com/gajus/roarr) logger.

Export `ROARR_LOG=true` environment variable to enable log printing to `stdout`.

Use [@roarr/cli](https://github.com/gajus/roarr-cli) to pretty-print logs.

```bash
tsx turbowatch.ts | roarr
```

## Alternatives

The biggest benefit of using Turbowatch is that it provides a single abstraction for all file watching operations. That is, you might get away with Nodemon, concurrently, `--watch`, etc. running in parallel, but using Turbowatch will introduce consistency to how you perform watch operations.

### Why not use Watchman?

Turbowatch is based on [Watchman](https://facebook.github.io/watchman/), and while Watchman is great at watching files, Turbowatch adds a layer of abstraction for orchestrating task execution in response to file changes (shell interface, graceful shutdown, output grouping, etc).

### Why not use Nodemon?

[Nodemon](https://nodemon.io/) is a popular software to monitor files for changes. However, Turbowatch is more performant and more flexible.

Turbowatch is based on [Watchman](https://facebook.github.io/watchman/), which has been built to monitor tens of thousands of files with little overhead.

In terms of the API, Turbowatch leverages powerful Watchman [expression language](#expressions-cheat-sheet) and [zx](https://github.com/google/zx) `child_process` abstractions to give you granular control over event handling and script execution.

### Why not use X --watch?

Many tools provide built-in watch functionality, e.g. `tsc --watch`. However, there are couple of problems with relying on them:

* Running many file watchers is inefficient and is probably draining your laptop's battery faster than you realize. Turbowatch uses a single server to watch all file changes.
* Native tools do not allow to combine operations, e.g. If your build depends on `tsc` and `tsc-alias`, then you cannot combine them. Turbowatch allows you to chain arbitrary operations.

### Why not concurrently?

I have [seen](https://github.com/justkey007/tsc-alias#add-it-to-your-build-scripts-in-packagejson) [concurrently](https://github.com/open-cli-tools/concurrently) used to "chain" watch operations such as:

```bash
concurrently "tsc -w" "tsc-alias -w"
```

While this might work by brute-force, it will produce unexpected results as the order of execution is not guaranteed.

If you are using Turbowatch, simply execute one command after the other in the trigger workflow, e.g.

```ts
async ({ spawn }: ChangeEvent) => {
  await spawn`tsc`;
  await spawn`tsc-alias`;
},
```

### Why not Turborepo?

[Turborepo](https://turbo.build/) currently does not have support for watch mode (issue [#986](https://github.com/vercel/turbo/issues/986)). However, Turbowatch has been designed to work with Turborepo.

To use Turbowatch with Turborepo:

1. define a persistent task
1. run the persistent task using `--parallel`

Example:

```json
"dev": {
  "cache": false,
  "persistent": true
},
```

```bash
turbo run dev --parallel
```

> **Note** We found that using `dependsOn` with Turbowatch produces undesirable effects. Instead, simply use Turbowatch rules to identify when dependencies update.

> **Note** Turbowatch is not aware of the Turborepo dependency graph. Meaning, that your builds might fail at the first attempt. However, thanks to retries and debounce, it will start working after warming up. We are currently exploring how to reduce preventable failures. Please open an if you would like your ideas to be considered.