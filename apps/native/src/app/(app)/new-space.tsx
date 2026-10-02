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
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
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

// One form, two jobs: `/new-space` creates, `/new-space?id=…` edits. The form
// is keyed by the loaded space so its `useState` initializers seed once from
// the server value and a cached query refresh never overwrites in-flight edits.
export default function NewSpaceScreen() {
  useAppLocale();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = id !== undefined;

  // 'skip' (not `enabled`) keeps create mode from subscribing with an empty
  // id — see item/[id].tsx for why `enabled` is not enough here.
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

  // Edit mode waits for the space to arrive; create mode renders immediately.
  if (editing && isLoading) {
    return <ScreenLoader label={t("loading.space")} />;
  }

  // The space is gone, inaccessible, or the link is stale. This guard is the
  // invariant the form below relies on: `mode: 'edit'` may only mount with a
  // real space, so it can never fall through to `createSpace`. Without it, a
  // settled null/error query would render the create form on the edit route.
  if (editing && (isError || space === null)) {
    return (
      <View style={styles.loading}>
        <Text>{t("spaces.unavailable")}</Text>
      </View>
    );
  }

  if (editing && space) {
    return <SpaceForm key={space._id} mode="edit" space={space} />;
  }
  return <SpaceForm key="new" mode="create" />;
}

type Space = Pick<Doc<"spaces">, "_id" | "name" | "dynamic">;

// A discriminated union makes the two modes impossible to confuse: in edit
// mode `space` is guaranteed present, so `save` switches on `mode` and the
// create branch is structurally unreachable from edit mode.
type SpaceFormProps = { mode: "create" } | { mode: "edit"; space: Space };

function SpaceForm(props: SpaceFormProps) {
  useAppLocale();
  const editing = props.mode === "edit";
  const router = useRouter();
  const { theme } = useUnistyles();
  const reducedMotion = useReducedMotion();
  const createSpace = useMutation(api.spaces.createSpace);
  const updateSpace = useMutation(api.spaces.updateSpace);
  // Creating a space and enabling dynamic are Pro — route to the paywall if
  // not entitled. Editing a name or turning dynamic off stays open to lapsed
  // users (managing existing data).
  const { guard } = usePaywallGuard("new_space");

  // Seeded once per (keyed) mount: a fresh create starts dynamic on; an edit
  // starts from the loaded space. A query refresh remounts via key only if the
  // id changes, so user typing is never overwritten.
  const [name, setName] = useState(
    props.mode === "edit" ? props.space.name : "",
  );
  // Dynamic is the marquee behavior — on by default for a new space; an edit
  // mirrors the server, treating a legacy status-less space as off.
  const [dynamic, setDynamic] = useState(
    props.mode === "edit" ? (props.space.dynamic ?? false) : true,
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    // Creating any space is Pro; editing is Pro only when turning dynamic on.
    const needsPro =
      props.mode === "create" ||
      (props.mode === "edit" && dynamic && !(props.space.dynamic ?? false));
    if (needsPro) {
      const ok = await guard();
      if (!ok) return;
    }
    setSaving(true);
    try {
      if (props.mode === "edit") {
        await updateSpace({ id: props.space._id, name: trimmed, dynamic });
      } else {
        await createSpace({ name: trimmed, dynamic });
      }
      analytics.capture(editing ? "space_updated" : "space_created", {
        dynamic,
      });
      if (process.env.EXPO_OS === "ios") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      router.back();
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
      <Text style={styles.heading}>
        {editing ? t("spaces.editTitle") : t("spaces.newTitle")}
      </Text>
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

      <View style={styles.dynamicRow}>
        <View style={styles.dynamicText}>
          <Text style={styles.dynamicLabel}>{t("spaces.dynamic")}</Text>
          <Text style={styles.dynamicHint}>{t("spaces.dynamicHelp")}</Text>
        </View>
        <AnimatedSwitch value={dynamic} onValueChange={setDynamic} />
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
              <ActivityIndicator
                size="small"
                color={theme.colors.primaryForeground}
              />
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
  content: {
    padding: theme.gap(2.5),
    gap: theme.gap(1.5),
  },
  heading: {
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
  dynamicRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.gap(1.5),
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
