// Slot-indexed stand-in for React's hook bindings, for testing effect-only
// hooks without a renderer: useState/useRef keep values by call order,
// useEffect diffs deps and runs cleanups, and a setState outside a render
// re-renders. Vitest isolates test files, so this module-level singleton is
// per file; `mount` resets its slots between hooks.
//
// Wire it up in a test file with (the dynamic import keeps the factory
// hoist-safe, and the static import is the typed handle tests drive):
//
//   vi.mock("react", async () => {
//     const { reactStandIn } = await import("../test/react-stand-in");
//     return reactStandIn;
//   });
//   import { reactStandIn as react } from "../test/react-stand-in";

type EffectSlot = { deps?: unknown[]; cleanup?: () => void };

let slots: unknown[] = [];
let effectSlots: EffectSlot[] = [];
let cursor = 0;
let hook: (() => unknown) | undefined;
let rendering = false;
let dirty = false;
const pending: (() => void)[] = [];

const render = (): unknown => {
  let result: unknown;
  rendering = true;
  do {
    dirty = false;
    cursor = 0;
    result = hook?.();
    while (pending.length) pending.shift()!();
  } while (dirty);
  rendering = false;
  return result;
};

const depsChanged = (
  prev: unknown[] | undefined,
  next: unknown[] | undefined,
) =>
  !prev ||
  !next ||
  prev.length !== next.length ||
  prev.some((value, i) => !Object.is(value, next[i]));

export const reactStandIn = {
  useState<T>(initial: T | (() => T)) {
    const i = cursor++;
    if (!(i in slots))
      slots[i] =
        typeof initial === "function" ? (initial as () => T)() : initial;
    const set = (next: T | ((prev: T) => T)) => {
      const value =
        typeof next === "function"
          ? (next as (prev: T) => T)(slots[i] as T)
          : next;
      if (Object.is(value, slots[i])) return;
      slots[i] = value;
      if (rendering) dirty = true;
      else render();
    };
    return [slots[i] as T, set] as const;
  },
  useRef<T>(initial: T) {
    const i = cursor++;
    if (!(i in slots)) slots[i] = { current: initial };
    return slots[i] as { current: T };
  },
  useCallback<T>(callback: T) {
    return callback;
  },
  useEffect(effect: () => void | (() => void), deps?: unknown[]) {
    const i = cursor++;
    const prev = slots[i] as EffectSlot | undefined;
    if (prev && !depsChanged(prev.deps, deps)) return;
    const slot: EffectSlot = { deps };
    slots[i] = slot;
    effectSlots.push(slot);
    pending.push(() => {
      prev?.cleanup?.();
      const cleanup = effect();
      if (typeof cleanup === "function") slot.cleanup = cleanup;
    });
  },
  mount<T>(run: () => T): T {
    slots = [];
    effectSlots = [];
    hook = run;
    return render() as T;
  },
  rerender<T>(): T {
    return render() as T;
  },
  unmount() {
    for (const slot of effectSlots) slot.cleanup?.();
    slots = [];
    effectSlots = [];
    hook = undefined;
  },
};
