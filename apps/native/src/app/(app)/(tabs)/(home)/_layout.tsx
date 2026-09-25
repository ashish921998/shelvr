import { useAppLocale } from "@/lib/i18n";
import { Stack } from "expo-router";
import { useUnistyles } from "react-native-unistyles";

// Home draws its own header: the wordmark between two drawn buttons, with the
// ochre hairline under it. A native bar cannot carry the hairline, and the
// redesign wants the same header on every platform, so the stack's is off.
export default function HomeStackLayout() {
  useAppLocale();
  const { theme } = useUnistyles();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen name="index" />
    </Stack>
  );
}
