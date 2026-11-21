import { ScreenTitle } from "@/components/screen-title";
import { CollectionsList } from "@/components/shared-list/collections-list";
import { t, useAppLocale } from "@/lib/i18n";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export default function CollectionsScreen() {
  useAppLocale();
  return (
    <View style={styles.screen}>
      <ScreenTitle title={t("homePlaces.collections")} />
      <CollectionsList />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
}));
