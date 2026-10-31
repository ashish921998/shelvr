import { SignInView } from "@/components/sign-in-view";
import { AppSymbolIcon } from "@/components/symbol";
import { Button } from "@/components/ui/button";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { ThemedText } from "@/components/ui/themed-text";
import { analytics } from "@/lib/analytics";
import { t, useAppLocale } from "@/lib/i18n";
import { clearPendingInvite, setPendingInvite } from "@/lib/pending-invite";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useConvexAuth } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export default function ListInviteScreen() {
  useAppLocale();
  const { theme } = useUnistyles();
  const router = useRouter();
  const { token: raw } = useLocalSearchParams<{ token: string }>();
  const token = raw ?? "";
  const { isLoading, isAuthenticated } = useConvexAuth();
  const preview = useQuery(
    convexQuery(api.sharedLists.invitePreview, { token }),
  );
  const [signingIn, setSigningIn] = useState(false);
  const leave = () => {
    clearPendingInvite();
    if (router.canGoBack()) router.back();
    else router.replace("/(app)/(tabs)/(home)");
  };
  const join = () => {
    analytics.capture("shared_list_join_tapped", {
      signed_in: isAuthenticated,
    });
    setPendingInvite(token);
    if (!isAuthenticated) setSigningIn(true);
  };

  if (signingIn && !isAuthenticated) {
    return (
      <SignInView
        onBack={() => {
          clearPendingInvite();
          setSigningIn(false);
        }}
      />
    );
  }
  if (preview.data === undefined || isLoading) {
    return preview.isError ? (
      <Dead onLeave={leave} />
    ) : (
      <ScreenLoader label={t("common.loading")} />
    );
  }
  if (preview.data === null) return <Dead onLeave={leave} />;

  const { inviterName, name, placeCount, cities, placeNames } = preview.data;
  const more = placeCount - placeNames.length;
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.avatar}>
          {inviterName ? (
            <ThemedText variant="headline" style={styles.avatarText}>
              {inviterName.slice(0, 1).toLocaleUpperCase()}
            </ThemedText>
          ) : (
            <AppSymbolIcon
              name="person.fill"
              size={26}
              tintColor={theme.colors.surface}
            />
          )}
        </View>
        <ThemedText variant="largeTitle">
          {inviterName === undefined
            ? t("sharedLists.joinTitleNoName")
            : t("sharedLists.joinTitle", { name: inviterName })}
        </ThemedText>
        <ThemedText variant="body" style={styles.muted}>
          {t("sharedLists.joinBody")}
        </ThemedText>
        <View style={styles.card}>
          <ThemedText variant="title">{name}</ThemedText>
          <ThemedText variant="footnote" style={styles.muted}>
            {[
              t("homePlaces.spotCount", { count: placeCount }),
              cities.join(", "),
            ]
              .filter(Boolean)
              .join(" · ")}
          </ThemedText>
          {placeNames.map((place) => (
            <ThemedText
              key={place}
              variant="subheadStrong"
              style={styles.placeName}
            >
              {place}
            </ThemedText>
          ))}
          {more > 0 ? (
            <ThemedText variant="footnote" style={styles.muted}>
              {t("sharedLists.andMore", { count: more })}
            </ThemedText>
          ) : null}
        </View>
        <View style={styles.footer}>
          <ThemedText variant="footnote" style={[styles.muted, styles.center]}>
            {t("sharedLists.joinFree")}
          </ThemedText>
          <Button
            testID="list-invite-join"
            title={t("sharedLists.join")}
            onPress={join}
          />
          <Pressable
            accessibilityRole="button"
            onPress={leave}
            style={({ pressed }) => [styles.notNow, pressed && styles.pressed]}
          >
            <ThemedText variant="button" style={styles.muted}>
              {t("common.notNow")}
            </ThemedText>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Dead({ onLeave }: { onLeave: () => void }) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={[styles.content, styles.deadContent]}>
        <ThemedText variant="title" style={styles.center}>
          {t("sharedLists.deadTitle")}
        </ThemedText>
        <ThemedText variant="body" style={[styles.muted, styles.center]}>
          {t("sharedLists.deadBody")}
        </ThemedText>
        <Button title={t("sharedLists.backHome")} onPress={onLeave} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    flexGrow: 1,
    gap: theme.gap(2),
    paddingHorizontal: theme.gap(2.5),
    paddingTop: theme.gap(4),
    paddingBottom: theme.gap(3),
  },
  deadContent: { justifyContent: "center", alignItems: "stretch" },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.foreground,
  },
  avatarText: { color: theme.colors.surface },
  card: {
    gap: theme.gap(0.75),
    padding: theme.gap(2),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  placeName: { paddingTop: theme.gap(0.5) },
  footer: { marginTop: "auto", gap: theme.gap(1.5) },
  notNow: { alignItems: "center", paddingVertical: theme.gap(1) },
  muted: { color: theme.colors.muted },
  center: { textAlign: "center" },
  pressed: { opacity: theme.opacity.pressed },
}));
