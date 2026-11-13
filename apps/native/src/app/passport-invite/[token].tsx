import {
  DeadPassport,
  PassportCompare,
} from "@/components/passport/passport-compare";
import { SignInView } from "@/components/sign-in-view";
import { Button } from "@/components/ui/button";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { ThemedText } from "@/components/ui/themed-text";
import { analytics } from "@/lib/analytics";
import { t, useAppLocale } from "@/lib/i18n";
import { compareCities } from "@/lib/passport-share";
import { clearPendingInvite, setPendingPassport } from "@/lib/pending-invite";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useConvexAuth } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";

function Count({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.count}>
      <Text style={styles.countValue}>{value}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  );
}

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

  const { ownerName, places, cities, countries, stamps } = preview.data;
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
        <View style={styles.counts}>
          <Count value={places} label={t("passport.places")} />
          <View style={styles.divider} />
          <Count value={cities} label={t("passport.cities")} />
          {countries !== null ? (
            <>
              <View style={styles.divider} />
              <Count value={countries} label={t("passport.countries")} />
            </>
          ) : null}
        </View>
        <Button
          testID="passport-invite-compare"
          title={t("passportShare.compare")}
          onPress={compare}
        />
        {compareCities(stamps).map((group) => (
          <View key={group.city ?? ""} style={styles.card}>
            <ThemedText variant="title">
              {group.city ?? t("passport.elsewhere")}
            </ThemedText>
            {group.names.map((name, index) => (
              <ThemedText key={`${name}-${index}`} variant="body">
                {name}
              </ThemedText>
            ))}
          </View>
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
  counts: {
    flexDirection: "row",
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  count: { flex: 1, alignItems: "center", paddingVertical: theme.gap(1.5) },
  countValue: { ...theme.type.displayTitle, color: theme.colors.foreground },
  countLabel: {
    ...theme.type.labelStrong,
    color: theme.colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  divider: { width: 1, backgroundColor: theme.colors.border },
  card: {
    gap: theme.gap(0.5),
    padding: theme.gap(2),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  notNow: { alignItems: "center", paddingVertical: theme.gap(1) },
  muted: { color: theme.colors.muted },
  pressed: { opacity: theme.opacity.pressed },
}));
