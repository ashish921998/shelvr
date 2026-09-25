import { useAppLocale } from "@/lib/i18n";
import { Stack } from "expo-router";
import { useUnistyles } from "react-native-unistyles";

// Tidy draws its own header: undo, the source and progress, the delete queue
// and the album picker — with the ochre hairline under it like every root tab.
export default function TidyStackLayout() {
  useAppLocale();
  const { theme } = useUnistyles();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      {/* Tidy is swiped, so the back-swipe gesture stays off or a card
          drag would pop the screen instead of sorting a photo. */}
      <Stack.Screen name="index" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
