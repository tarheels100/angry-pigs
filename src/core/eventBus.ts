import type { GameEvents } from './types.ts';

/** Event names are the keys of GameEvents; payloads are typed per name. */
type EventName = keyof GameEvents;

type Handler<K extends EventName> = (payload: GameEvents[K]) => void;

export interface EventBus {
  on<K extends EventName>(name: K, handler: Handler<K>): () => void;
  emit<K extends EventName>(name: K, payload: GameEvents[K]): void;
  /** Number of registered handlers; used by tests to assert no listener leaks. */
  handlerCount(name: EventName): number;
}

/**
 * Typed pub/sub (D8). The game layer emits; presentation subscribes. Handlers are
 * isolated: a throwing UI handler must not stop the simulation loop.
 */
export function createEventBus(): EventBus {
  const handlers = new Map<EventName, Set<Handler<EventName>>>();

  return {
    on(name, handler) {
      let set = handlers.get(name);
      if (!set) {
        set = new Set();
        handlers.set(name, set);
      }
      set.add(handler as Handler<EventName>);
      return () => {
        set!.delete(handler as Handler<EventName>);
      };
    },
    emit(name, payload) {
      const set = handlers.get(name);
      if (!set) return;
      // Copy so a handler that unsubscribes during emission does not mutate the
      // set mid-iteration.
      for (const handler of [...set]) {
        try {
          handler(payload);
        } catch (error) {
          console.error(`event handler for "${name}" threw`, error);
        }
      }
    },
    handlerCount: (name) => handlers.get(name)?.size ?? 0,
  };
}
