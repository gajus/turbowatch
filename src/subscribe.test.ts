import { subscribe } from './subscribe';
import { type Trigger } from './types';
import { setTimeout } from 'node:timers';
import * as sinon from 'sinon';
import { expect, it } from 'vitest';

const defaultTrigger = {
  abortSignal: new AbortController().signal,
  expression: ['match', 'foo', 'basename'],
  id: 'foo',
  initialRun: true,
  interruptible: false,
  name: 'foo',
  onChange: async () => {},
  onTeardown: async () => {},
  persistent: false,
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

it('evaluates onChange', async () => {
  const trigger = {
    ...defaultTrigger,
  } as Trigger;

  const triggerMock = sinon.mock(trigger);

  const onChangeExpectation = triggerMock
    .expects('onChange')
    .once()
    .resolves(null);

  const subscription = subscribe(trigger);

  subscription.trigger([]);

  expect(triggerMock.verify());

  expect(onChangeExpectation.args[0][0].taskId).toMatch(/^[a-z\d]{8}$/u);
});

it('skips onChange if teardown is initiated', async () => {
  const trigger = {
    ...defaultTrigger,
  } as Trigger;

  const triggerMock = sinon.mock(trigger);

  const onChangeExpectation = triggerMock.expects('onChange').atLeast(1);

  onChangeExpectation.onFirstCall().resolves(wait(100));

  onChangeExpectation.onSecondCall().resolves(null);

  const subscription = subscribe(trigger);

  subscription.trigger([{ filename: 'foo' }]);
  subscription.teardown();
  subscription.trigger([{ filename: 'bar' }]);

  await wait(300);

  expect(onChangeExpectation.callCount).toBe(1);
});

it('initiates teardown at most once', async () => {
  const trigger = {
    ...defaultTrigger,
  } as Trigger;

  const triggerMock = sinon.mock(trigger);

  const onTeardownExpectation = triggerMock.expects('onTeardown').atLeast(1);

  const subscription = subscribe(trigger);

  subscription.teardown();
  subscription.teardown();

  await wait(300);

  expect(onTeardownExpectation.callCount).toBe(1);
});

it('swallow onChange errors', async () => {
  const trigger = {
    ...defaultTrigger,
  } as Trigger;

  const subscriptionMock = sinon.mock(trigger);

  subscriptionMock.expects('onChange').once().rejects(new Error('foo'));

  const subscription = subscribe(trigger);

  await subscription.trigger([]);

  expect(subscriptionMock.verify());
});

it('removes duplicates', async () => {
  const trigger = {
    ...defaultTrigger,
  };

  const subscriptionMock = sinon.mock(trigger);

  const onChange = subscriptionMock.expects('onChange').once().resolves(null);

  const subscription = subscribe(trigger);

  subscription.trigger([
    {
      filename: '/foo',
    },
    {
      filename: '/foo',
    },
    {
      filename: '/bar',
    },
  ]);

  expect(subscriptionMock.verify());

  expect(onChange.args[0][0].files).toEqual([
    { name: '/foo' },
    { name: '/bar' },
  ]);
});

it('waits for onChange to complete when { interruptible: false }', async () => {
  const abortController = new AbortController();

  const trigger = {
    ...defaultTrigger,
    abortSignal: abortController.signal,
    interruptible: false,
  };

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

  const subscription = subscribe(trigger);

  await subscription.trigger([]);
  await subscription.trigger([]);

  expect(onChange.callCount).toBe(2);
});

it('waits for onChange to complete when { interruptible: true } when it receives a shutdown signal', async () => {
  const abortController = new AbortController();

  const trigger = {
    ...defaultTrigger,
    abortSignal: abortController.signal,
  };

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
        }, 100);
      });
    });

  const subscription = subscribe(trigger);

  setImmediate(() => {
    abortController.abort();
  });

  await subscription.trigger([]);

  expect(subscriptionMock.verify());

  expect(resolved).toBe(true);
});

it('retries failing routines', async () => {
  const trigger = {
    ...defaultTrigger,
    retry: {
      retries: 1,
    },
  };

  const subscriptionMock = sinon.mock(trigger);

  const onChange = subscriptionMock.expects('onChange').twice();

  onChange.onFirstCall().rejects(new Error('foo'));
  onChange.onSecondCall().resolves(null);

  const subscription = await subscribe(trigger);

  await subscription.trigger([]);

  expect(onChange.verify());
});

it('reports { first: true } only for the first event', async () => {
  const trigger = {
    ...defaultTrigger,
  };

  const subscriptionMock = sinon.mock(trigger);

  const onChange = subscriptionMock.expects('onChange').twice();

  onChange.onFirstCall().resolves(null);

  onChange.onSecondCall().resolves(null);

  const subscription = subscribe(trigger);

  await subscription.trigger([]);
  await subscription.trigger([]);

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

it('retries persistent routine if it exits with success', async () => {
  const trigger = {
    ...defaultTrigger,
    persistent: true,
    retry: {
      maxTimeout: 100,
      retries: 1,
    },
  };

  const onChange = sinon.stub(trigger, 'onChange');

  onChange.resolves(() => {
    return wait(100);
  });

  const subscription = await subscribe(trigger);

  void subscription.trigger([]);

  await wait(500);

  subscription.activeTask?.abortController?.abort();

  expect(onChange.callCount).toBeGreaterThan(2);
});

it('retries persistent routine if it exists with error', async () => {
  const trigger = {
    ...defaultTrigger,
    persistent: true,
    retry: {
      maxTimeout: 100,
      retries: 1,
    },
  };

  const onChange = sinon.stub(trigger, 'onChange');

  onChange.resolves(async () => {
    await wait(100);

    throw new Error('foo');
  });

  const subscription = await subscribe(trigger);

  void subscription.trigger([]);

  await wait(500);

  subscription.activeTask?.abortController?.abort();

  expect(onChange.callCount).toBeGreaterThan(2);
});

it('stops retrying persistent routine if teardown is called', async () => {
  const trigger = {
    ...defaultTrigger,
    persistent: true,
    retry: {
      maxTimeout: 100,
      retries: 1,
    },
  };

  const onChange = sinon.stub(trigger, 'onChange');

  onChange.resolves(async () => {
    await wait(100);
  });

  const subscription = await subscribe(trigger);

  void subscription.trigger([]);

  await wait(500);

  await subscription.teardown();

  await wait(100);

  const firstCallCount = onChange.callCount;

  await wait(500);

  expect(onChange.callCount).toBe(firstCallCount);
});

it('does not begin the new routine until the interrupted routine has completed', async () => {
  const trigger = {
    ...defaultTrigger,
    interruptible: true,
    persistent: true,
    retry: {
      maxTimeout: 100,
      retries: 1,
    },
  };

  const onChange = sinon.stub(trigger, 'onChange');

  onChange.resolves(async () => {
    await wait(100);
  });

  const subscription = await subscribe(trigger);

  void subscription.trigger([]);

  await wait(10);

  void subscription.trigger([]);

  await wait(10);

  subscription.activeTask?.abortController?.abort();

  expect(onChange.callCount).toBe(1);
});

it('does not begin the new routine until the interrupted routine has completed (multiple-triggers)', async () => {
  const trigger = {
    ...defaultTrigger,
    interruptible: true,
    persistent: true,
    retry: {
      maxTimeout: 100,
      retries: 1,
    },
  };

  const onChange = sinon.stub(trigger, 'onChange');

  onChange.resolves(async () => {
    await wait(100);
  });

  const subscription = await subscribe(trigger);

  void subscription.trigger([]);

  await wait(10);

  void subscription.trigger([]);
  void subscription.trigger([]);

  await wait(10);

  subscription.activeTask?.abortController?.abort();

  expect(onChange.callCount).toBe(1);
});
