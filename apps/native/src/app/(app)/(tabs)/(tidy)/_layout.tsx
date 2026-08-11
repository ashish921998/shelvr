import { Stack } from 'expo-router';
import { StyleSheet } from 'react-native-unistyles';

export default function TidyStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerTransparent: true,
        headerShadowVisible: false,
        headerTitleAlign: 'center',
        headerTitleStyle: styles.title,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'tidy', gestureEnabled: false }} />
    </Stack>
  );
}

const styles = StyleSheet.create((theme) => ({
  title: {
    fontFamily: theme.fonts.display,
    fontSize: 26,
    letterSpacing: 0.5,
    color: theme.colors.foreground,
  },
}));
