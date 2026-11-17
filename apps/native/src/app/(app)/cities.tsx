import { CityGrid, HomePlacesEmptyCard } from "@/components/home/home-places";
import { Button } from "@/components/ui/button";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { t, useAppLocale } from "@/lib/i18n";
import { useHomeCities } from "@/lib/use-home-cities";
import { ScrollView } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export default function CitiesScreen() {
  useAppLocale();
  const { data: cities, isError, refetch } = useHomeCities();
  if (!cities && !isError) return <ScreenLoader />;
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      style={styles.screen}
    >
      {cities ? (
        cities.length > 0 ? (
          <CityGrid cities={cities} />
        ) : (
          <HomePlacesEmptyCard />
        )
      ) : (
        <Button title={t("common.retry")} onPress={() => void refetch()} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: { backgroundColor: theme.colors.background },
  content: { padding: theme.gap(2) },
}));
