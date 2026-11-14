import {
  CityNames,
  DeadPassport,
  PassportCompare,
} from "@/components/passport/passport-compare";
import { PassportCounts } from "@/components/passport/passport-counts";
import { SignInView } from "@/components/sign-in-view";
import { Button } from "@/components/ui/button";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { ThemedText } from "@/components/ui/themed-text";
import { analytics } from "@/lib/analytics";
import { t, useAppLocale } from "@/lib/i18n";
import { clearPendingInvite, setPendingPassport } from "@/lib/pending-invite";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useConvexAuth } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

export default function PassportInviteScreen() {
  useAppLocale();
  const router = useRouter();
  const params = useLocalSearchParams<{ token: string; compare?: string }>();
  const token = params.token ?? "";
  const { isLoading, isAuthenticated } = useConvexAuth();
  const preview = useQuery(
    convexQuery(api.passportShares.passportPreview, { token }),
  );
  const [signingIn, setSigningIn] = useState(false);
  const [comparing, setComparing] = useState(params.compare === "1");
  const leave = () => {
    clearPendingInvite();
    router.replace("/(app)/(tabs)/(home)");
  };
  const opened = useRef(false);
  useEffect(() => {
    if (preview.data === undefined || opened.current) return;
    opened.current = true;
    analytics.capture("passport_invite_opened", {
      found: preview.data !== null,
      signed_in: isAuthenticated,
    });
  }, [preview.data, isAuthenticated]);
  useEffect(() => {
    if (preview.error) {
      analytics.captureError("passport_preview_failed", preview.error);
    }
  }, [preview.error]);
  const compare = () => {
    analytics.capture("passport_compare_tapped", {
      signed_in: isAuthenticated,
    });
    if (isAuthenticated) {
      setComparing(true);
      return;
    }
    setPendingPassport(token);
    setSigningIn(true);
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
  if (comparing && isAuthenticated) {
    return (
      <SafeAreaView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          <PassportCompare token={token} onLeave={leave} />
          <Button
            testID="passport-compare-done"
            title={t("common.done")}
            onPress={leave}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }
  if (!preview.isError && (preview.data === undefined || isLoading)) {
    return <ScreenLoader label={t("common.loading")} />;
  }
  if (!preview.data) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.content}>
          <DeadPassport onLeave={leave} />
        </View>
      </SafeAreaView>
    );
  }

  const { ownerName, places, cities, countries, byCity } = preview.data;
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.avatar}>
          <ThemedText variant="headline" style={styles.avatarText}>
            {(ownerName ?? "?").slice(0, 1).toLocaleUpperCase()}
          </ThemedText>
        </View>
        <ThemedText variant="largeTitle">
          {ownerName === undefined
            ? t("passportShare.titleNoName")
            : t("passportShare.title", { name: ownerName })}
        </ThemedText>
        <PassportCounts places={places} cities={cities} countries={countries} />
        <Button
          testID="passport-invite-compare"
          title={t("passportShare.compare")}
          onPress={compare}
        />
        {byCity.map((group) => (
          <CityNames
            key={group.city ?? ""}
            city={group.city ?? null}
            names={group.names}
            heading="title"
          />
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={leave}
          style={({ pressed }) => [styles.notNow, pressed && styles.pressed]}
        >
          <ThemedText variant="button" style={styles.muted}>
            {t("common.notNow")}
          </ThemedText>
        </Pressable>
      </ScrollView>
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
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.foreground,
  },
  avatarText: { color: theme.colors.surface },
  notNow: { alignItems: "center", paddingVertical: theme.gap(1) },
  muted: { color: theme.colors.muted },
  pressed: { opacity: theme.opacity.pressed },
}));
