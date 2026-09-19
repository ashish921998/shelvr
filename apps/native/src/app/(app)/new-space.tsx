import { t, useAppLocale, localizeError } from "@/lib/i18n";
import { AnimatedSwitch } from "@/components/ui/animated-switch";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { EmptyState } from "@/components/empty-state";
import { InkIcon } from "@/components/ink/ink-icon";
import { InkShelf } from "@/components/ink/ink-shelf";
import { INK_A11Y } from "@/components/ink/ink-canvas";
import { PrimaryButton } from "@/components/shelf/ink-button";
import { ScreenHeader } from "@/components/shelf/screen-header";
import { Eyebrow } from "@/components/shelf/typography";
import { useInkClock } from "@/lib/ink/use-ink-clock";
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
import { Alert, ScrollView, Text, TextInput, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { analytics } from "@/lib/analytics";

/** The drawn shelf under the name field is the width of the content gutter. */
const PREVIEW_WIDTH = 240;

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
      <View style={styles.screen}>
        <EmptyState
          title={t("common.unavailable")}
          message={t("spaces.unavailable")}
        />
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
  const clock = useInkClock();
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

  const trimmed = name.trim();

  // A development reload or a direct link can restore this sheet as the root
  // route, where there is no history entry to pop.
  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        clock={clock}
        title={editing ? t("spaces.editTitle") : t("spaces.newTitle")}
        right={
          <HeaderIconButton
            icon="xmark"
            label={t("common.close")}
            onPress={close}
            testID="close-new-shelf"
          />
        }
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* The shelf you are making, drawn, with the name on its label. It
            follows the field as you type: the point of this screen is an
            object, not a record. */}
        <View style={styles.preview} {...INK_A11Y}>
          <View style={styles.label}>
            <Text
              style={[styles.labelText, !trimmed && styles.labelPlaceholder]}
              numberOfLines={1}
            >
              {trimmed || t("spaces.titlePlaceholder")}
            </Text>
          </View>
          <InkShelf
            width={PREVIEW_WIDTH}
            clock={clock}
            prop="books"
            propAt={0.82}
          />
        </View>

        <Eyebrow style={styles.eyebrow}>{t("spaces.nameEyebrow")}</Eyebrow>
        <TextInput
          style={styles.nameInput}
          placeholder={t("spaces.titlePlaceholder")}
          placeholderTextColor={theme.colors.faint}
          value={name}
          onChangeText={setName}
          maxLength={MAX_SPACE_NAME_LENGTH}
          autoFocus={!editing}
        />
        <Text style={styles.help}>{t("spaces.editorHelp")}</Text>

        <View style={styles.dynamicRow}>
          <InkIcon
            name="sparkles"
            size={18}
            tint={theme.colors.primaryText}
            clock={clock}
          />
          <View style={styles.dynamicText}>
            <Text style={styles.dynamicLabel}>{t("spaces.dynamic")}</Text>
            <Text style={styles.dynamicHint}>{t("spaces.dynamicHelp")}</Text>
          </View>
          <AnimatedSwitch value={dynamic} onValueChange={setDynamic} />
        </View>

        {/* The button says it is working by being stitched along — the app
            has no spinners. */}
        <PrimaryButton
          label={editing ? t("common.saveChanges") : t("spaces.create")}
          pendingLabel={editing ? t("spaces.saving") : t("spaces.building")}
          state={saving ? "pending" : trimmed ? "idle" : "disabled"}
          onPress={() => void save()}
          style={styles.submit}
          testID="save-shelf"
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    paddingHorizontal: theme.gap(3),
    paddingTop: theme.gap(2),
    paddingBottom: theme.gap(5),
    gap: theme.gap(1.5),
  },
  preview: { alignItems: "center", alignSelf: "center", marginBottom: 4 },
  // The label stands on the board like any other save: bottom-anchored so the
  // tilt pivots where it touches.
  label: {
    maxWidth: PREVIEW_WIDTH - 48,
    marginBottom: 2,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    transform: [{ rotate: "-2deg" }],
    transformOrigin: "bottom center",
    shadowColor: "#2b2418",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  labelText: {
    fontFamily: theme.fonts.bold,
    fontSize: 14,
    color: theme.colors.foreground,
  },
  labelPlaceholder: { color: theme.colors.faint },
  eyebrow: { alignSelf: "flex-start" },
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
  help: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.muted,
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
  dynamicText: { flex: 1, gap: 2 },
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
  submit: { alignSelf: "stretch", marginTop: theme.gap(1) },
}));
