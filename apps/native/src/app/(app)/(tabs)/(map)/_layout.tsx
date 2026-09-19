import { useAppLocale } from "@/lib/i18n";
import { Stack } from "expo-router";
import { useUnistyles } from "react-native-unistyles";

// Map draws its own header so the ochre hairline sits under it, like every
// other root tab. The map itself stays a real native map — see index.tsx.
export default function MapStackLayout() {
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
