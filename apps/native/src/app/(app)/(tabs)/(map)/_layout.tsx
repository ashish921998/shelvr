import { Stack } from "expo-router";

/** The map runs edge to edge under its filter row, so it has no header. */
export default function MapStackLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
