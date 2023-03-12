import { subscribe } from './subscribe';
import { type Trigger } from './types';
import { EventEmitter } from 'events';
import { setTimeout } from 'node:timers';
import * as sinon from 'sinon';
import { expect, it } from 'vitest';

class Client extends EventEmitter {
  public cancelCommands() {}

  public capabilityCheck() {}

  public command() {}

  public connect() {}

  public end() {}

  public sendNextCommand() {}
}

const defaultTrigger = {
  expression: ['match', 'foo', 'basename'],
  id: 'foo',
  interruptible: false,
  name: 'foo',
  onChange: async () => {},
  relativePath: 'foo',
  retry: {
    retries: 0,
  },
  throttleOutput: {
    delay: 0,
  },
  watch: 'foo',
} as Trigger;

const wait = (time: number) => {
  return new Promise((resolve) => {
    setTimeout(resolve, time);
  });
};

it('rejects promise if Watchman "subscribe" command produces an error', async () => {
  const client = new Client();
  const trigger = {
    ...defaultTrigger,
  } as Trigger;

  const clientMock = sinon.mock(client);

  clientMock
    .expects('command')
    .once()
    .callsFake((args, callback) => {
      callback(new Error('foo'));
    });

  await expect(subscribe(client, trigger)).rejects.toThrowError('foo');

  expect(clientMock.verify());
});

it('evaluates onChange', async () => {
  const abortController = new AbortController();

  const client = new Client();
  const trigger = {
    ...defaultTrigger,
    abortSignal: abortController.signal,
  } as Trigger;

  const subscriptionMock = sinon.mock(trigger);

  const onChange = subscriptionMock
    .expects('onChange')
    .once()
    .callsFake(() => {
      abortController.abort();

      return Promise.resolve(null);
    });

  const clientMock = sinon.mock(client);

  clientMock
    .expects('on')
    .once()
    .callsFake((event, callback) => {
      setImmediate(() => {
        callback({
          files: [],
          subscription: 'foo',
        });
      });
    });

  await subscribe(client, trigger);

  expect(clientMock.verify());
  expect(subscriptionMock.verify());

  expect(onChange.args[0][0].taskId).toMatch(/^[a-z\d]{8}$/u);
});

it('evaluates multiple onChange', async () => {
  const abortController = new AbortController();

  const client = new Client();
  const trigger = {
    ...defaultTrigger,
    abortSignal: abortController.signal,
  } as Trigger;

  const subscriptionMock = sinon.mock(trigger);

  const onChange = subscriptionMock.expects('onChange').thrice();

  onChange.onFirstCall().resolves(null);

  onChange.onSecondCall().resolves(null);

  onChange.onThirdCall().callsFake(() => {
    abortController.abort();

    return Promise.resolve(null);
  });

  const clientMock = sinon.mock(client);

  clientMock.expects('on').callsFake((event, callback) => {
    callback({
      files: [],
      subscription: 'foo',
    });
    setTimeout(() => {
      callback({
        files: [],
        subscription: 'foo',
      });
      setTimeout(() => {
        callback({
          files: [],
          subscription: 'foo',
        });
      });
    });
  });

  await subscribe(client, trigger);

  expect(onChange.callCount).toBe(3);
});

it('debounces onChange', async () => {
  const abortController = new AbortController();

  const client = new Client();
  const trigger = {
    ...defaultTrigger,
    abortSignal: abortController.signal,
    debounce: {
      wait: 100,
    },
  } as Trigger;

  const subscriptionMock = sinon.mock(trigger);

  const onChange = subscriptionMock.expects('onChange').thrice();

  setTimeout(() => {
    abortController.abort();
  }, 200);

  onChange.onFirstCall().resolves(null);

  const clientMock = sinon.mock(client);

  clientMock.expects('on').callsFake((event, callback) => {
    callback({
      files: [],
      subscription: 'foo',
    });
    setTimeout(() => {
      callback({
        files: [],
        subscription: 'foo',
      });
      setTimeout(() => {
        callback({
          files: [],
          subscription: 'foo',
        });
      });
    });
  });

  await subscribe(client, trigger);

  expect(onChange.callCount).toBe(1);
});

it('waits for onChange to complete when { interruptible: false }', async () => {
  const abortController = new AbortController();

  const client = new Client();
  const trigger = {
    ...defaultTrigger,
    abortSignal: abortController.signal,
    interruptible: false,
  } as Trigger;

  const triggerMock = sinon.mock(trigger);

  const onChange = triggerMock.expects('onChange').twice();

  let completed = false;

  onChange.onFirstCall().callsFake(async () => {
    await wait(100);

    completed = true;
  });

  onChange.onSecondCall().callsFake(() => {
    expect(completed).toBe(true);

    abortController.abort();
  });

  const clientMock = sinon.mock(client);

  clientMock.expects('on').callsFake((event, callback) => {
    callback({
      files: [],
      subscription: 'foo',
    });
    callback({
      files: [],
      subscription: 'foo',
    });
  });

  await subscribe(client, trigger);

  expect(onChange.callCount).toBe(2);
});

it('throws if onChange produces an error', async () => {
  const abortController = new AbortController();

  const client = new Client();
  const trigger = {
    ...defaultTrigger,
    abortSignal: abortController.signal,
  } as Trigger;

  const subscriptionMock = sinon.mock(trigger);

  subscriptionMock.expects('onChange').rejects(new Error('foo'));

  const clientMock = sinon.mock(client);

  clientMock.expects('on').callsFake((event, callback) => {
    callback({
      files: [],
      subscription: 'foo',
    });
  });

  await expect(subscribe(client, trigger)).rejects.toThrowError('foo');

  await abortController.abort();
});

it('retries failing routines', async () => {
  const abortController = new AbortController();

  const client = new Client();
  const trigger = {
    ...defaultTrigger,
    abortSignal: abortController.signal,
    retry: {
      retries: 1,
    },
  } as Trigger;

  const subscriptionMock = sinon.mock(trigger);

  const onChange = subscriptionMock.expects('onChange').twice();

  onChange.onFirstCall().rejects(new Error('foo'));
  onChange.onSecondCall().callsFake(() => {
    abortController.abort();

    return Promise.resolve(null);
  });

  const clientMock = sinon.mock(client);

  clientMock.expects('on').callsFake((event, callback) => {
    callback({
      files: [],
      subscription: 'foo',
    });
  });

  await subscribe(client, trigger);
});

it('reports { first: true } only for the first event', async () => {
  const abortController = new AbortController();

  const client = new Client();
  const trigger = {
    ...defaultTrigger,
    abortSignal: abortController.signal,
  } as Trigger;

  const subscriptionMock = sinon.mock(trigger);

  const onChange = subscriptionMock.expects('onChange').twice();

  onChange.onFirstCall().resolves(null);

  onChange.onSecondCall().callsFake(() => {
    abortController.abort();

    return Promise.resolve(null);
  });

  const clientMock = sinon.mock(client);

  clientMock.expects('on').callsFake((event, callback) => {
    callback({
      files: [],
      subscription: 'foo',
    });
    callback({
      files: [],
      subscription: 'foo',
    });
  });

  await subscribe(client, trigger);

  expect(onChange.args).toMatchObject([
    [
      {
        first: true,
      },
    ],
    [
      {
        first: false,
      },
    ],
  ]);

  expect(subscriptionMock.verify());
});

it('waits for onChange to complete before resolving when it receives a shutdown signal', async () => {
  const abortController = new AbortController();

  const client = new Client();
  const trigger = {
    ...defaultTrigger,
    abortSignal: abortController.signal,
  } as Trigger;

  let resolved = false;

  const subscriptionMock = sinon.mock(trigger);

  subscriptionMock
    .expects('onChange')
    .once()
    .callsFake(() => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolved = true;

          resolve(null);
        }, 1_000);
      });
    });

  const clientMock = sinon.mock(client);

  clientMock
    .expects('on')
    .once()
    .callsFake((event, callback) => {
      callback({
        files: [],
        subscription: 'foo',
      });
    });

  setImmediate(() => {
    abortController.abort();
  });

  await subscribe(client, trigger);

  expect(clientMock.verify());
  expect(subscriptionMock.verify());

  expect(resolved).toBe(true);
});
