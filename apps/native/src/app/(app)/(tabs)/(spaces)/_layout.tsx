import { useAppLocale } from "@/lib/i18n";
import { Stack } from "expo-router";
import { useUnistyles } from "react-native-unistyles";

// The Shelves tab draws its own header, like Home, so the hairline is under it
// on every platform.
export default function SpacesStackLayout() {
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
