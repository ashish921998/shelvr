"use client";

import { useSyncExternalStore } from "react";

const subscribeNever = () => () => {};

export function useBrowserValue<
  T extends string | number | boolean | undefined,
>(read: () => T, serverValue: T): T {
  return useSyncExternalStore(subscribeNever, read, () => serverValue);
}
