import { GhostButton } from "@/components/onboarding/parts";
import { Button } from "@/components/ui/button";
import { PromptSheet } from "@/components/ui/prompt-sheet";
import { ThemedText } from "@/components/ui/themed-text";
import { analytics } from "@/lib/analytics";
import { t } from "@/lib/i18n";
import { api } from "@convex/_generated/api";
import { firstNameOf } from "@convex/model/firstName";
import { useMutation } from "convex/react";
import { useState } from "react";
import { Alert, TextInput, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const MAX_NAME_CHARS = 40;

type NameSheetKind = "join" | "create" | "joined" | "welcome";

function bodyFor(kind: NameSheetKind, partner: string | undefined): string {
  if (kind === "create") return t("sharedLists.nameBodyCreate");
  if (kind === "welcome") return t("sharedLists.nameBodyWelcome");
  return partner === undefined
    ? t("sharedLists.nameBodyJoinNoName")
    : t("sharedLists.nameBodyJoin", { name: partner });
}

function actionFor(kind: NameSheetKind): string {
  switch (kind) {
    case "join":
      return t("sharedLists.join");
    case "create":
      return t("sharedLists.sendInvite");
    case "joined":
    case "welcome":
      return t("common.save");
  }
}

export function NameSheet({
  visible,
  kind,
  partner,
  placeName,
  onDone,
  onCancel,
  onDismiss,
}: {
  visible: boolean;
  kind: NameSheetKind;
  partner?: string;
  placeName?: string;
  onDone: () => void;
  onCancel: () => void;
  onDismiss?: () => void;
}) {
  const { theme } = useUnistyles();
  const save = useMutation(api.users.setMyName);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const first = firstNameOf(typed);
  const shown = first ?? t("sharedLists.yourName");

  const submit = async () => {
    if (first === undefined || busy) return;
    setBusy(true);
    try {
      await save({ name: typed });
      analytics.capture("shared_list_name_prompt", { kind, outcome: "named" });
      onDone();
    } catch (error) {
      analytics.captureError("shared_list_name_failed", error);
      Alert.alert(t("sharedLists.nameFailed"));
    } finally {
      setBusy(false);
    }
  };
  const skip = () => {
    analytics.capture("shared_list_name_prompt", { kind, outcome: "skipped" });
    onDone();
  };

  return (
    <PromptSheet
      visible={visible}
      onClose={kind === "joined" || kind === "welcome" ? skip : onCancel}
      onDismiss={onDismiss}
      title={t("sharedLists.nameTitle")}
      body={bodyFor(kind, partner)}
      testID="list-name-sheet"
      actions={
        <>
          <Button
            testID="list-name-submit"
            title={actionFor(kind)}
            disabled={first === undefined}
            loading={busy}
            onPress={() => void submit()}
          />
          <GhostButton
            testID="list-name-skip"
            label={t("sharedLists.nameSkip")}
            onPress={skip}
          />
        </>
      }
    >
      <View style={styles.preview}>
        <View style={[styles.pin, kind === "create" && styles.invitePin]} />
        <View style={styles.previewText}>
          <ThemedText variant="subheadStrong" numberOfLines={1}>
            {kind === "create"
              ? t("sharedLists.invite")
              : (placeName ?? t("sharedLists.namePreviewPlace"))}
          </ThemedText>
          <ThemedText variant="footnote" style={styles.muted} numberOfLines={2}>
            {kind === "create"
              ? t("sharedLists.joinTitle", { name: shown })
              : t("sharedLists.savedBy", { name: shown })}
          </ThemedText>
        </View>
      </View>
      <TextInput
        testID="list-name-input"
        value={typed}
        onChangeText={setTyped}
        onSubmitEditing={() => void submit()}
        placeholder={t("sharedLists.firstNamePlaceholder")}
        placeholderTextColor={theme.colors.muted}
        accessibilityLabel={t("sharedLists.firstNamePlaceholder")}
        maxLength={MAX_NAME_CHARS}
        autoCapitalize="words"
        autoComplete="given-name"
        textContentType="givenName"
        autoFocus
        returnKeyType="done"
        style={styles.input}
      />
    </PromptSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  preview: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    padding: theme.gap(1.5),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  pin: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
  },
  invitePin: { backgroundColor: theme.colors.foreground },
  previewText: { flex: 1, gap: theme.gap(0.25) },
  muted: { color: theme.colors.muted },
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
}));
