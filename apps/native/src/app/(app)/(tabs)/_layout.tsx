import { Slot } from "expo-router";

// Without an anchor, Expo Router 58 opens the group's first route alphabetically.
// eslint-disable-next-line @typescript-eslint/naming-convention -- Expo Router reads this exact export name.
export const unstable_settings = { anchor: "(home)" };

/** Home is the only screen left in the group, so there is no tab bar. */
export default function TabsLayout() {
  return <Slot />;
}
