import { LibraryRows } from "@/components/home/library-rows";
import { ReviewSaves, type ReviewSave } from "@/components/home/review-saves";
import { SharedListsSection } from "@/components/home/shared-lists-section";
import { PassportRow } from "@/components/passport/passport-row";
import { AppSymbolIcon } from "@/components/symbol";
import { Button } from "@/components/ui/button";
import { ThemedText } from "@/components/ui/themed-text";
import { withAlpha } from "@/lib/color";
import { canBrowse } from "@/lib/access";
import { useAccess, useSaveGuard } from "@/lib/free-plan";
import { t, useAppLocale } from "@/lib/i18n";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export function HomePlacesEmptyCard() {
  const router = useRouter();
  const { theme } = useUnistyles();
  const { guard } = useSaveGuard("home");
  return (
    <>
      <PassportRow hideEmpty />
      <View style={styles.card}>
        <View style={styles.cardIcon}>
          <AppSymbolIcon
            name="mappin"
            size={26}
            tintColor={theme.colors.primaryText}
          />
        </View>
        <ThemedText variant="title" style={styles.centered}>
          {t("homePlaces.emptyTitle")}
        </ThemedText>
        <ThemedText variant="subhead" style={[styles.centered, styles.muted]}>
          {t("homePlaces.emptyBody")}
        </ThemedText>
        <Button
          title={t("homePlaces.addSpot")}
          onPress={() => void guard(() => router.push("/add"))}
          style={styles.cardButton}
        />
      </View>
    </>
  );
}

export function HomePlaces({ saves }: { saves: ReviewSave[] }) {
  useAppLocale();
  const browsing = canBrowse(useAccess());
  const cities = useQuery(
    convexQuery(api.items.listCities, browsing ? {} : "skip"),
  );
  const loaded = browsing ? cities.data : undefined;
  return (
    <>
      <View style={styles.rows}>
        <LibraryRows cityCount={loaded?.length} />
        <ReviewSaves saves={saves} />
      </View>
      {loaded && loaded.length > 0 ? <PassportRow /> : null}
      <SharedListsSection cities={loaded} />
      {loaded?.length === 0 ? (
        <View style={styles.emptyCities}>
          <HomePlacesEmptyCard />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  rows: { paddingHorizontal: theme.gap(2.5) },
  emptyCities: { paddingHorizontal: theme.gap(2), paddingTop: theme.gap(3) },
  muted: { color: theme.colors.muted },
  card: {
    alignItems: "center",
    gap: theme.gap(1.25),
    paddingHorizontal: theme.gap(2.5),
    paddingTop: theme.gap(3.5),
    paddingBottom: theme.gap(3),
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: withAlpha(theme.colors.muted, 0.5),
    backgroundColor: theme.colors.surfaceMuted,
  },
  cardIcon: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 28,
    backgroundColor: theme.colors.primarySoft,
  },
  centered: { textAlign: "center" },
  cardButton: { alignSelf: "stretch", marginTop: theme.gap(1) },
}));
