import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { Platform, StatusBar, View } from "react-native";
import ConvexClientProvider from "../../ConvexClientProvider";

const AMBER = "#E4572E";
const statusBarHeight =
  Platform.OS === "ios" ? 50 : (StatusBar.currentHeight ?? 0);

export default function RootLayout() {
  const [loaded] = useFonts({
    Bold: require("../assets/fonts/Inter-Bold.ttf"),
    SemiBold: require("../assets/fonts/Inter-SemiBold.ttf"),
    Medium: require("../assets/fonts/Inter-Medium.ttf"),
    Regular: require("../assets/fonts/Inter-Regular.ttf"),
    MBold: require("../assets/fonts/Montserrat-Bold.ttf"),
    MSemiBold: require("../assets/fonts/Montserrat-SemiBold.ttf"),
    MMedium: require("../assets/fonts/Montserrat-Medium.ttf"),
    MRegular: require("../assets/fonts/Montserrat-Regular.ttf"),
    MLight: require("../assets/fonts/Montserrat-Light.ttf"),
  });

  if (!loaded) return null;

  return (
    <ConvexClientProvider>
      <View style={{ flex: 1, backgroundColor: "#F7F1E8" }}>
        <View style={{ height: statusBarHeight, backgroundColor: AMBER }}>
          <StatusBar
            translucent
            backgroundColor={AMBER}
            barStyle="light-content"
          />
        </View>
        <Stack screenOptions={{ headerShown: false }} />
      </View>
    </ConvexClientProvider>
  );
}
