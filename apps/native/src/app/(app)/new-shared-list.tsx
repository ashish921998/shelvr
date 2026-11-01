import { AppSymbolIcon } from "@/components/symbol";
import { Chip } from "@/components/trip-planner/chip";
import { FormSection } from "@/components/trip-planner/trip-planner-form";
import { Button } from "@/components/ui/button";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { ThemedText } from "@/components/ui/themed-text";
import { analytics } from "@/lib/analytics";
import { usePaywallGuard } from "@/lib/entitlement";
import { haptics } from "@/lib/haptics";
import { t, useAppLocale } from "@/lib/i18n";
import { backOrHome } from "@/lib/screen-dismiss";
import { shareInvite } from "@/lib/shared-lists";
import type { TextMessageKey } from "@/locales/message-types";
import { api } from "@convex/_generated/api";
import {
  MAX_LIST_CITIES,
  MAX_LIST_NAME_CHARS,
} from "@convex/model/sharedListLimits";
import { MAX_CITY_CHARS } from "@convex/model/trip";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { Stack, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const NAME_SUGGESTIONS: TextMessageKey[] = [
  "sharedLists.suggestDate",
  "sharedLists.suggestWeekend",
  "sharedLists.suggestEat",
];

function CityRow({
  title,
  detail,
  selected,
  onPress,
}: {
  title: string;
  detail: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={`${title}, ${detail}`}
      accessibilityState={{ checked: selected }}
      onPress={() => {
        void haptics.selection();
        onPress();
      }}
      style={({ pressed }) => [styles.cityRow, pressed && styles.pressed]}
    >
      <View style={styles.cityText}>
        <ThemedText variant="subheadStrong">{title}</ThemedText>
        <ThemedText variant="footnote" style={styles.muted}>
          {detail}
        </ThemedText>
      </View>
      <View style={[styles.check, selected && styles.checkOn]}>
        {selected ? (
          <AppSymbolIcon
            name="checkmark"
            size={14}
            weight="bold"
            tintColor={theme.colors.surface}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

export default function NewSharedListScreen() {
  useAppLocale();
  const router = useRouter();
  const { theme } = useUnistyles();
  const cities = useQuery(convexQuery(api.items.listCities, {}));
  const create = useMutation(api.sharedLists.createSharedList);
  const { guard, loading } = usePaywallGuard("shared_list");
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const close = useCallback(() => backOrHome(router), [router]);
  const known = (cities.data ?? []).slice(0, MAX_LIST_CITIES);
  const custom = picked.filter(
    (city) => !known.some((choice) => choice.city === city),
  );
  const addTyped = () => {
    const city = typed.replace(/\s+/g, " ").trim();
    if (city === "" || picked.length >= MAX_LIST_CITIES) return;
    if (!picked.includes(city)) setPicked((current) => [...current, city]);
    setTyped("");
  };
  const fill = {
    background: theme.colors.primary,
    foreground: theme.colors.onTint,
  };

  const toggleCity = (city: string) =>
    setPicked((current) =>
      current.includes(city)
        ? current.filter((entry) => entry !== city)
        : [...current, city],
    );

  const submit = async () => {
    if (busy || loading || name.trim() === "" || picked.length === 0) return;
    setBusy(true);
    try {
      if (!(await guard())) return;
      const { listId, inviteToken } = await create({
        name: name.trim(),
        cities: picked,
      });
      analytics.capture("shared_list_created", { cities: picked.length });
      void haptics.success();
      await shareInvite(inviteToken, "new");
      router.replace({ pathname: "/shared-list/[id]", params: { id: listId } });
    } catch (error) {
      analytics.captureError("shared_list_create_failed", error);
      Alert.alert(t("sharedLists.createFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen} accessibilityViewIsModal>
      <Stack.Screen
        options={{
          title: t("sharedLists.newTitle"),
          headerTitleStyle: {
            ...theme.type.title,
            color: theme.colors.foreground,
          },
          ...(Platform.OS === "android"
            ? {
                headerLeft: () => (
                  <HeaderIconButton
                    icon="xmark"
                    label={t("common.close")}
                    onPress={close}
                  />
                ),
              }
            : {}),
        }}
      />
      {Platform.OS === "ios" ? (
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Button
            icon="xmark"
            tintColor={theme.colors.foreground}
            onPress={close}
          >
            {t("common.close")}
          </Stack.Toolbar.Button>
        </Stack.Toolbar>
      ) : null}
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.content}
      >
        <ThemedText variant="body" style={styles.muted}>
          {t("sharedLists.newBody")}
        </ThemedText>
        <FormSection title={t("sharedLists.nameLabel")}>
          <TextInput
            testID="new-shared-list-name"
            value={name}
            onChangeText={setName}
            placeholder={t("sharedLists.namePlaceholder")}
            placeholderTextColor={theme.colors.muted}
            accessibilityLabel={t("sharedLists.nameLabel")}
            maxLength={MAX_LIST_NAME_CHARS}
            returnKeyType="done"
            style={styles.input}
          />
          <View style={styles.chips}>
            {NAME_SUGGESTIONS.map((key) => (
              <Chip
                key={key}
                label={t(key)}
                selected={name === t(key)}
                pick="radio"
                fill={fill}
                onPress={() => setName(t(key))}
              />
            ))}
          </View>
        </FormSection>
        <FormSection
          title={t("sharedLists.startWith")}
          hint={t("sharedLists.startWithHint")}
        >
          {known.map((choice) => (
            <CityRow
              key={choice.city}
              title={choice.city}
              detail={t("homePlaces.spotCount", {
                count: choice.placeCount ?? choice.count,
              })}
              selected={picked.includes(choice.city)}
              onPress={() => toggleCity(choice.city)}
            />
          ))}
          {custom.map((city) => (
            <CityRow
              key={city}
              title={city}
              detail={t("sharedLists.typedCity")}
              selected
              onPress={() => toggleCity(city)}
            />
          ))}
          {picked.length < MAX_LIST_CITIES ? (
            <TextInput
              testID="new-shared-list-city"
              value={typed}
              onChangeText={setTyped}
              onSubmitEditing={addTyped}
              onBlur={addTyped}
              placeholder={t("sharedLists.cityPlaceholder")}
              placeholderTextColor={theme.colors.muted}
              accessibilityLabel={t("sharedLists.cityPlaceholder")}
              maxLength={MAX_CITY_CHARS}
              autoCapitalize="words"
              returnKeyType="done"
              style={styles.input}
            />
          ) : null}
        </FormSection>
      </ScrollView>
      <View style={styles.footer}>
        <ThemedText variant="footnote" style={[styles.muted, styles.hint]}>
          {t("sharedLists.inviteHint")}
        </ThemedText>
        <Button
          testID="new-shared-list-submit"
          title={t("sharedLists.sendInvite")}
          disabled={name.trim() === "" || picked.length === 0}
          loading={busy || loading}
          onPress={() => void submit()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    gap: theme.gap(3),
    paddingHorizontal: theme.gap(2.5),
    paddingTop: theme.gap(2),
    paddingBottom: theme.gap(3),
  },
  input: {
    ...theme.type.body,
    minHeight: theme.control.minHeight,
    paddingHorizontal: theme.gap(1.5),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    color: theme.colors.foreground,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: theme.gap(1) },
  cityRow: {
    minHeight: theme.control.minHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    paddingVertical: theme.gap(1),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  cityText: { flex: 1, gap: theme.gap(0.25) },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: {
    borderColor: theme.colors.foreground,
    backgroundColor: theme.colors.foreground,
  },
  muted: { color: theme.colors.muted },
  hint: { textAlign: "center" },
  footer: {
    gap: theme.gap(1.5),
    paddingHorizontal: theme.gap(2.5),
    paddingTop: theme.gap(1.5),
    paddingBottom: rt.insets.bottom + theme.gap(1.5),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  pressed: { opacity: theme.opacity.pressed },
}));
