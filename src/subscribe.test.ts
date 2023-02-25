import {
  subscribe,
} from './subscribe';
import {
  type Trigger,
  type WatchmanClient,
} from './types';
import * as sinon from 'sinon';
import {
  expect,
  it,
} from 'vitest';

it('rejects promise if Watchman "subscribe" command produces an error', async () => {
  const client = {
    command: () => {},
  } as unknown as WatchmanClient;
  const trigger = {} as Trigger;

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
  const client = {
    command: () => {},
    on: () => {},
  } as unknown as WatchmanClient;
  const trigger = {
    id: 'foo',
    onChange: () => {},
  } as unknown as Trigger;

  const subscriptionMock = sinon.mock(trigger);

  subscriptionMock.expects('onChange').once().resolves(null);

  const abortController = new AbortController();

  setTimeout(() => {
    abortController.abort();
  }, 100);

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

  await subscribe(client, trigger, abortController.signal);

  expect(clientMock.verify());
  expect(subscriptionMock.verify());
});

it('throws if onChange produces an error', async () => {
  const client = {
    command: () => {},
    on: () => {},
  } as unknown as WatchmanClient;
  const trigger = {
    id: 'foo',
    onChange: () => {},
  } as unknown as Trigger;

  const subscriptionMock = sinon.mock(trigger);

  subscriptionMock.expects('onChange').rejects(new Error('foo'));

  const abortController = new AbortController();

  setTimeout(() => {
    abortController.abort();
  }, 100);

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

  await expect(subscribe(client, trigger, abortController.signal)).rejects.toThrowError('foo');
});

it('reports first only for the first event', async () => {
  const client = {
    command: () => {},
    on: () => {},
  } as unknown as WatchmanClient;
  const trigger = {
    id: 'foo',
    onChange: () => {},
  } as unknown as Trigger;

  const subscriptionMock = sinon.mock(trigger);

  const onChange = subscriptionMock.expects('onChange').twice().resolves(null);

  const abortController = new AbortController();

  setTimeout(() => {
    abortController.abort();
  }, 100);

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

  await subscribe(client, trigger, abortController.signal);

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
