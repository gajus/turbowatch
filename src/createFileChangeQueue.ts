import { deduplicateFileChangeEvents } from './deduplicateFileChangeEvents';
import { hashFile } from './hashFile';
import { testExpression } from './testExpression';
import {
  type Debounce,
  type FileChangeEvent,
  type Subscription,
} from './types';
import path from 'node:path';
import { debounce } from 'throttle-debounce';

export const createFileChangeQueue = ({
  project,
  abortSignal,
  userDebounce,
  subscriptions,
}: {
  abortSignal: AbortSignal;
  project: string;
  subscriptions: Subscription[];
  userDebounce: Debounce;
}) => {
  const fileHashMap: Record<string, string> = {};

  let queuedFileChangeEvents: FileChangeEvent[] = [];

  const evaluateSubscribers = debounce(
    userDebounce.wait,
    () => {
      const currentFileChangeEvents = deduplicateFileChangeEvents(
        queuedFileChangeEvents,
      );

      queuedFileChangeEvents = [];

      const filesWithUnchangedHash: string[] = [];

      for (const fileChangeEvent of currentFileChangeEvents) {
        const { filename, hash } = fileChangeEvent;

        if (!hash) {
          continue;
        }

        const previousHash = fileHashMap[filename];

        if (previousHash === hash) {
          filesWithUnchangedHash.push(filename);
        } else {
          fileHashMap[filename] = hash;
        }
      }

      for (const subscription of subscriptions) {
        const relevantEvents: FileChangeEvent[] = [];

        for (const fileChangeEvent of currentFileChangeEvents) {
          if (filesWithUnchangedHash.includes(fileChangeEvent.filename)) {
            continue;
          }

          if (
            !testExpression(
              subscription.expression,
              path.relative(project, fileChangeEvent.filename),
            )
          ) {
            continue;
          }

          relevantEvents.push(fileChangeEvent);
        }

        if (relevantEvents.length) {
          if (abortSignal?.aborted) {
            return;
          }

          void subscription.trigger(relevantEvents);
        }
      }
    },
    {
      noLeading: true,
    },
  );

  return {
    trigger: (fileChangeEvent: FileChangeEvent) => {
      if (fileChangeEvent.hash === undefined) {
        // eslint-disable-next-line promise/prefer-await-to-then
        hashFile(fileChangeEvent.filename).then((hash) => {
          queuedFileChangeEvents.push({
            ...fileChangeEvent,
            hash,
          });

          evaluateSubscribers();
        });
      } else {
        queuedFileChangeEvents.push(fileChangeEvent);

        evaluateSubscribers();
      }
    },
  };
};
