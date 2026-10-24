import { t, useAppLocale, localizeError } from "@/lib/i18n";
import { AnimatedSwitch } from "@/components/ui/animated-switch";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { usePaywallGuard } from "@/lib/entitlement";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { MAX_SPACE_NAME_LENGTH } from "@convex/model/spaceName";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, {
  FadeOut,
  Keyframe,
  useReducedMotion,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { analytics } from "@/lib/analytics";
import { motion, REDUCED_FADE_IN, REDUCED_FADE_OUT } from "@/lib/motion";
import { StitchRow } from "@/components/ui/stitch-loader";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { backOrHome } from "@/lib/screen-dismiss";

const SUBMIT_CONTENT_ENTER = new Keyframe({
  0: { opacity: 0, transform: [{ scale: motion.scale.pressed }] },
  100: {
    opacity: 1,
    transform: [{ scale: 1 }],
    easing: motion.easing.out,
  },
}).duration(motion.duration.state);
const SUBMIT_CONTENT_EXIT = FadeOut.duration(motion.duration.exit).easing(
  motion.easing.out,
);

export default function NewSpaceScreen() {
  useAppLocale();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = id !== undefined;
  const router = useRouter();

  const {
    data: space,
    isLoading,
    isError,
  } = useQuery(
    convexQuery(
      api.spaces.getSpace,
      editing ? { id: id as Id<"spaces"> } : "skip",
    ),
  );

  if (editing && isLoading) {
    return <ScreenLoader label={t("loading.space")} />;
  }

  if (editing && (isError || space === null)) {
    return (
      <View style={styles.loading}>
        <View style={styles.unavailableClose}>
          <HeaderIconButton
            icon="xmark"
            label={t("common.close")}
            onPress={() => backOrHome(router)}
          />
        </View>
        <Text>{t("spaces.unavailable")}</Text>
      </View>
    );
  }

  if (editing && space) {
    return <SpaceForm key={space._id} mode="edit" space={space} />;
  }
  return <SpaceForm key="new" mode="create" />;
}

type Space = Pick<Doc<"spaces">, "_id" | "name" | "dynamic" | "autoFile">;

type SpaceFormProps = { mode: "create" } | { mode: "edit"; space: Space };

function SpaceForm(props: SpaceFormProps) {
  useAppLocale();
  const editing = props.mode === "edit";
  const router = useRouter();
  const navigation = useNavigation();
  const { theme } = useUnistyles();
  const reducedMotion = useReducedMotion();
  const createSpace = useMutation(api.spaces.createSpace);
  const updateSpace = useMutation(api.spaces.updateSpace);
  const { guard } = usePaywallGuard("new_space");

  const [name, setName] = useState(
    props.mode === "edit" ? props.space.name : "",
  );
  const [dynamic, setDynamic] = useState(
    props.mode === "edit" ? (props.space.dynamic ?? false) : true,
  );
  const [autoFile, setAutoFile] = useState(
    props.mode === "edit" ? (props.space.autoFile ?? false) : false,
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    const needsPro =
      props.mode === "create" ||
      (props.mode === "edit" &&
        ((dynamic && !(props.space.dynamic ?? false)) ||
          (dynamic && autoFile && !(props.space.autoFile ?? false))));
    if (needsPro) {
      const ok = await guard();
      if (!ok) return;
    }
    setSaving(true);
    try {
      let createdId: Id<"spaces"> | null = null;
      if (props.mode === "edit") {
        await updateSpace({
          id: props.space._id,
          name: trimmed,
          dynamic,
          autoFile: dynamic && autoFile,
        });
      } else {
        createdId = await createSpace({
          name: trimmed,
          dynamic,
          autoFile: dynamic && autoFile,
        });
      }
      analytics.capture(editing ? "space_updated" : "space_created", {
        dynamic,
        auto_file: dynamic && autoFile,
      });
      if (process.env.EXPO_OS === "ios") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      // The sheet may have been swiped away while the save ran.
      if (!navigation.isFocused()) return;
      if (createdId) {
        router.replace({ pathname: "/space/[id]", params: { id: createdId } });
      } else {
        backOrHome(router);
      }
    } catch (error) {
      // A ConvexError carries the server's user-facing sentence in `data`;
      // anything else is redacted to "Server Error" in production.
      Alert.alert(
        editing ? t("spaces.saveFailed") : t("spaces.createFailed"),
        error instanceof ConvexError && typeof error.data === "string"
          ? localizeError(error.data, "errors.tryAgain")
          : t("errors.tryAgain"),
      );
      setSaving(false);
    }
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
    >
      <View style={styles.sheetHeader}>
        <Text accessibilityRole="header" style={styles.heading}>
          {editing ? t("spaces.editTitle") : t("spaces.newTitle")}
        </Text>
        <HeaderIconButton
          icon="xmark"
          label={t("common.close")}
          disabled={saving}
          onPress={() => backOrHome(router)}
        />
      </View>
      <Text style={styles.subheading}>{t("spaces.editorHelp")}</Text>

      <TextInput
        style={styles.nameInput}
        placeholder={t("spaces.titlePlaceholder")}
        placeholderTextColor={theme.colors.faint}
        value={name}
        onChangeText={setName}
        maxLength={MAX_SPACE_NAME_LENGTH}
        autoFocus={!editing}
      />

      <View style={styles.settingsCard}>
        <View style={styles.dynamicRow}>
          <View style={styles.dynamicText}>
            <Text style={styles.dynamicLabel}>{t("spaces.dynamic")}</Text>
            <Text style={styles.dynamicHint}>{t("spaces.dynamicHelp")}</Text>
          </View>
          <AnimatedSwitch value={dynamic} onValueChange={setDynamic} />
        </View>
        {dynamic ? (
          <View style={[styles.dynamicRow, styles.rowDivider]}>
            <View style={styles.dynamicText}>
              <Text style={styles.dynamicLabel}>{t("spaces.autoFile")}</Text>
              <Text style={styles.dynamicHint}>{t("spaces.autoFileHelp")}</Text>
            </View>
            <AnimatedSwitch value={autoFile} onValueChange={setAutoFile} />
          </View>
        ) : null}
      </View>

      <Pressable
        onPress={save}
        disabled={!name.trim() || saving}
        style={({ pressed }) => [
          styles.saveButton,
          (!name.trim() || saving) && { opacity: 0.4 },
          pressed && { opacity: 0.8 },
        ]}
      >
        <View style={styles.saveButtonContent}>
          <Animated.View
            key={saving ? "saving" : "idle"}
            entering={reducedMotion ? REDUCED_FADE_IN : SUBMIT_CONTENT_ENTER}
            exiting={reducedMotion ? REDUCED_FADE_OUT : SUBMIT_CONTENT_EXIT}
            collapsable={false}
            style={styles.saveButtonState}
          >
            {saving ? (
              <StitchRow color={theme.colors.primaryForeground} />
            ) : (
              <Text style={styles.saveButtonText}>
                {editing ? t("common.saveChanges") : t("spaces.create")}
              </Text>
            )}
          </Animated.View>
        </View>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  unavailableClose: {
    position: "absolute",
    top: theme.gap(2.5),
    right: theme.gap(2.5),
  },
  content: {
    padding: theme.gap(2.5),
    gap: theme.gap(1.5),
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.gap(1),
  },
  heading: {
    flexShrink: 1,
    fontFamily: theme.fonts.display,
    fontSize: 24,
    color: theme.colors.foreground,
  },
  subheading: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.muted,
  },
  nameInput: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.gap(1.5),
    fontFamily: theme.fonts.bold,
    fontSize: 17,
    color: theme.colors.foreground,
  },
  settingsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  dynamicRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    padding: theme.gap(1.5),
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  dynamicText: {
    flex: 1,
    gap: 2,
  },
  dynamicLabel: {
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    color: theme.colors.foreground,
  },
  dynamicHint: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.muted,
  },
  saveButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    paddingVertical: theme.gap(1.75),
    alignItems: "center",
  },
  saveButtonContent: {
    width: "100%",
    height: 20,
  },
  saveButtonState: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: {
    fontFamily: theme.fonts.bold,
    fontSize: 16,
    color: theme.colors.primaryForeground,
  },
}));
