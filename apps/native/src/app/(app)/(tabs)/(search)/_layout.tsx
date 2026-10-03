import { useAppLocale } from "@/lib/i18n";
import { Stack } from "expo-router";
import { useUnistyles } from "react-native-unistyles";

// Search draws its own header, like every other root tab. A native title here
// was drawn on top of it.
export default function SearchStackLayout() {
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
