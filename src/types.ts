// cspell:words idirname imatch iname ipcre pcre wholename oclock

import { type ProcessOutput } from 'zx';

export { type Client as WatchmanClient } from 'fb-watchman';

type RelationalOperator =
  // Equal =
  | 'eq'
  // Greater or equal >=
  | 'ge'
  // Greater >
  | 'gt'
  // Lower or equal <=
  | 'le'
  // Lower <
  | 'lt'
  // Not equal !=
  | 'ne';

type FileType =
  // an unknown file type
  | '?'
  // block special file
  | 'b'
  // character special file
  | 'c'
  // Solaris Door
  | 'D'
  // directory
  | 'd'
  // regular file
  | 'f'
  // symbolic link
  | 'l'
  // named pipe (fifo)
  | 'p'
  // socket
  | 's';

/* eslint-disable @typescript-eslint/sort-type-union-intersection-members */
type Expression =
  // Evaluates as true if all of the grouped expressions also evaluated as true.
  // https://facebook.github.io/watchman/docs/expr/allof.html
  | ['allof', ...Expression[]]
  // Evaluates as true if any of the grouped expressions also evaluated as true.
  // https://facebook.github.io/watchman/docs/expr/anyof.html
  | ['anyof', ...Expression[]]
  // Evaluates as true if a given file has a matching parent directory.
  // https://facebook.github.io/watchman/docs/expr/dirname.html
  | ['dirname' | 'idirname', string, ['depth', RelationalOperator, number]]
  // Evaluates as true if the file exists, has size 0 and is a regular file or directory.
  // https://facebook.github.io/watchman/docs/expr/empty.html
  | ['empty']
  // Evaluates as true if the file exists.
  // https://facebook.github.io/watchman/docs/expr/exists.html
  | ['exists']
  // Evaluates as true if a glob matches against the basename of the file.
  // https://facebook.github.io/watchman/docs/expr/match.html
  | ['match' | 'imatch', string | string[], 'basename' | 'wholename']
  // Evaluates as true if file matches the exact string.
  // https://facebook.github.io/watchman/docs/expr/name.html
  | ['name', string, 'basename' | 'wholename']
  // Evaluates as true if the sub-expression evaluated as false, i.e. inverts the sub-expression.
  // https://facebook.github.io/watchman/docs/expr/not.html
  | ['not', Expression]
  // Evaluates as true if file matches a Perl Compatible Regular Expression.
  // https://facebook.github.io/watchman/docs/expr/pcre.html
  | ['pcre' | 'ipcre', string, 'basename' | 'wholename']
  // Evaluates as true if the specified time property of the file is greater than the since value.
  // https://facebook.github.io/watchman/docs/expr/since.html
  | ['since', string | number, 'mtime' | 'ctime', 'oclock']
  // Evaluates as true if the size of a (not deleted) file satisfies the condition.
  // https://facebook.github.io/watchman/docs/expr/size.html
  | ['size', RelationalOperator, number]
  // Evaluates as true if the file suffix matches the second argument.
  // https://facebook.github.io/watchman/docs/expr/suffix.html
  | ['suffix', string | string[]]
  // Evaluates as true if the type of the file matches that specified by the second argument.
  // https://facebook.github.io/watchman/docs/expr/type.html
  | ['type', FileType];
/* eslint-enable @typescript-eslint/sort-type-union-intersection-members */

type JsonValue =
  | JsonObject
  | JsonValue[]
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | null
  | undefined;

export type JsonObject = {
  [k: string]: JsonValue;
};

/**
 * @property mtime The timestamp indicating the last time this file was modified.
 */
type File = {
  exists: boolean;
  mtime: number;
  name: string;
  size: number;
};

/**
 * @property attempt Attempt number (starting with 0) indicating if trigger was retried.
 * @property files Describes the list of files that changed.
 * @property first Identifies if this is the first event.
 * @property signal Instance of AbortSignal used to signal when the routine should be aborted.
 * @property spawn Instance of zx bound to AbortSignal.
 * @property warning Watchman warnings.
 */
export type ChangeEvent = {
  attempt: number;
  files: readonly File[];
  first: boolean;
  signal: AbortSignal | null;
  spawn: (
    pieces: TemplateStringsArray,
    ...args: any[]
  ) => Promise<ProcessOutput>;
  taskId: string;
  warning: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OnChangeEventHandler = (event: ChangeEvent) => Promise<any>;

/**
 * @property factor The exponential factor to use. Default is 2.
 * @property maxTimeout The maximum number of milliseconds between two retries. Default is Infinity.
 * @property minTimeout The number of milliseconds before starting the first retry. Default is 1000.
 * @property retries The maximum amount of times to retry the operation. Default is 10. Seting this to 1 means do it once, then retry it once.
 */
type Retry = {
  factor?: number;
  maxTimeout?: number;
  minTimeout?: number;
  retries?: number;
};

type Debounce = {
  leading?: boolean;
  wait: number;
};

export type Throttle = {
  delay: number;
};

/**
 * @property expression watchman expression, e.g. https://facebook.github.io/watchman/docs/expr/allof.html
 * @property interruptible Sends abort signal to an ongoing routine, if any. Otherwise, waits for routine to finish. (default: true)
 * @property name Name of the trigger. Used for debugging. Must match /^[a-z0-9-_]+$/ pattern and must be unique.
 * @property onChange Routine that is executed when file changes are detected.
 * @property persistent Label a task as persistent if it is a long-running process, such as a dev server or --watch mode.
 */
type TriggerInput = {
  debounce?: Debounce;
  expression: Expression;
  interruptible?: boolean;
  name: string;
  onChange: OnChangeEventHandler;
  persistent?: boolean;
  retry?: Retry;
  throttleOutput?: Throttle;
};

export type Trigger = {
  abortSignal?: AbortSignal;
  debounce?: Debounce;
  expression: Expression;
  id: string;
  interruptible: boolean;
  name: string;
  onChange: OnChangeEventHandler;
  relativePath: string;
  retry: Retry;
  throttleOutput: Throttle;
  watch: string;
};

/**
 * @property project absolute path to the directory to watch
 */
export type ConfigurationInput = {
  readonly project: string;
  readonly triggers: readonly TriggerInput[];
};

export type Configuration = {
  readonly project: string;
  readonly triggers: readonly TriggerInput[];
};
