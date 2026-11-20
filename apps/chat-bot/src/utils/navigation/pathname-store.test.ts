import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type EventHandler = EventListenerOrEventListenerObject;

function callEventHandler(handler: EventHandler, event: Event) {
  if (typeof handler === 'function') {
    handler(event);
    return;
  }

  handler.handleEvent(event);
}

function createMockWindow(initialPathname = '/') {
  const listeners = new Map<string, Set<EventHandler>>();

  const addEventListener = vi.fn((eventName: string, handler: EventHandler) => {
    const handlers = listeners.get(eventName) ?? new Set<EventHandler>();
    handlers.add(handler);
    listeners.set(eventName, handlers);
  });

  const removeEventListener = vi.fn((eventName: string, handler: EventHandler) => {
    const handlers = listeners.get(eventName);
    if (!handlers) {
      return;
    }

    handlers.delete(handler);
  });

  const mockWindow = {
    location: { pathname: initialPathname },
    addEventListener,
    removeEventListener,
  } as unknown as Window;

  const triggerPopstate = () => {
    const handlers = listeners.get('popstate');
    if (!handlers) {
      return;
    }

    const event = new Event('popstate');
    handlers.forEach((handler) => {
      callEventHandler(handler, event);
    });
  };

  return {
    mockWindow,
    triggerPopstate,
    addEventListener,
    removeEventListener,
  };
}

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');

describe('pathname-store', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
      return;
    }

    Reflect.deleteProperty(globalThis, 'window');
  });

  it('notifies subscribers for history changes and dedupes unchanged values', async () => {
    const { mockWindow } = createMockWindow('/initial');
    Object.defineProperty(globalThis, 'window', {
      value: mockWindow,
      configurable: true,
      writable: true,
    });

    const { subscribeToPathnameStore, getPathnameSnapshot, notifyPathnameChanged } =
      await import('./pathname-store');

    const listener = vi.fn();
    const unsubscribe = subscribeToPathnameStore(listener);

    expect(getPathnameSnapshot()).toBe('/initial');

    window.location.pathname = '/chat/new';
    notifyPathnameChanged();
    notifyPathnameChanged();

    expect(getPathnameSnapshot()).toBe('/chat/new');
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('syncs Next.js pathname updates and dedupes repeated values', async () => {
    const { mockWindow } = createMockWindow('/start');
    Object.defineProperty(globalThis, 'window', {
      value: mockWindow,
      configurable: true,
      writable: true,
    });

    const { subscribeToPathnameStore, getPathnameSnapshot, syncPathnameWithNextPathname } =
      await import('./pathname-store');

    const listener = vi.fn();
    const unsubscribe = subscribeToPathnameStore(listener);

    window.location.pathname = '/assistants/d/1';
    syncPathnameWithNextPathname('/assistants/d/1');
    syncPathnameWithNextPathname('/assistants/d/1');

    window.location.pathname = '/assistants/d/2';
    syncPathnameWithNextPathname('/assistants/d/2');

    expect(getPathnameSnapshot()).toBe('/assistants/d/2');
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it('ignores stale Next.js pathname values when location has already changed', async () => {
    const { mockWindow } = createMockWindow('/d/old');
    Object.defineProperty(globalThis, 'window', {
      value: mockWindow,
      configurable: true,
      writable: true,
    });

    const {
      subscribeToPathnameStore,
      getPathnameSnapshot,
      notifyPathnameChanged,
      syncPathnameWithNextPathname,
    } = await import('./pathname-store');

    const listener = vi.fn();
    const unsubscribe = subscribeToPathnameStore(listener);

    window.location.pathname = '/d/new';
    notifyPathnameChanged();

    // Simulates a newly mounted hook instance syncing an outdated `usePathname` value.
    syncPathnameWithNextPathname('/d/old');

    expect(getPathnameSnapshot()).toBe('/d/new');
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('updates snapshot and notifies subscribers on popstate', async () => {
    const { mockWindow, triggerPopstate } = createMockWindow('/old');
    Object.defineProperty(globalThis, 'window', {
      value: mockWindow,
      configurable: true,
      writable: true,
    });

    const { subscribeToPathnameStore, getPathnameSnapshot } = await import('./pathname-store');

    const listener = vi.fn();
    const unsubscribe = subscribeToPathnameStore(listener);

    window.location.pathname = '/new-path';
    triggerPopstate();

    expect(getPathnameSnapshot()).toBe('/new-path');
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('cleans up popstate listener when no subscribers remain', async () => {
    const { mockWindow, addEventListener, removeEventListener } = createMockWindow('/initial');
    Object.defineProperty(globalThis, 'window', {
      value: mockWindow,
      configurable: true,
      writable: true,
    });

    const { subscribeToPathnameStore } = await import('./pathname-store');

    const unsubscribeA = subscribeToPathnameStore(vi.fn());
    const unsubscribeB = subscribeToPathnameStore(vi.fn());

    expect(addEventListener).toHaveBeenCalledWith('popstate', expect.any(Function));

    unsubscribeA();
    expect(removeEventListener).not.toHaveBeenCalled();

    unsubscribeB();
    expect(removeEventListener).toHaveBeenCalledWith('popstate', expect.any(Function));
  });
});
