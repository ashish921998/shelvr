import { t, useAppLocale } from "@/lib/i18n";
import { EmptyState } from "@/components/empty-state";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { analytics } from "@/lib/analytics";

// Per-space membership toggles for one item. Every write here is the user's
// hand — `saved` rows only; flipping a space on also overrides a dismissal.
export default function ManageSpacesScreen() {
  useAppLocale();
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const id = itemId as Id<"items">;

  const { data: spaces } = useQuery(convexQuery(api.spaces.listSpaces, {}));
  const { data: item } = useQuery(convexQuery(api.items.getItem, { id }));

  const addItemToSpace = useMutation(api.spaces.addItemToSpace);
  const removeItemFromSpace = useMutation(api.spaces.removeItemFromSpace);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [lastChange, setLastChange] = useState<{
    itemId: Id<"items">;
    spaceId: Id<"spaces">;
    name: string;
    added: boolean;
  } | null>(null);

  // Optimistic overrides are keyed by item so a route-param change cannot
  // apply the previous item's toggles to the next item. Server-side changes
  // from another flow (e.g. a background suggestion accept) are not reconciled
  // for the active item.
  const [override, setOverride] = useState<{
    itemId: Id<"items">;
    values: Map<Id<"spaces">, boolean>;
  } | null>(null);
  const activeOverride = override?.itemId === id ? override.values : null;
  const serverMembers = useMemo(
    () => new Set((item?.spaces ?? []).map((s) => s._id)),
    [item],
  );
  const members = useMemo(() => {
    if (!activeOverride) return serverMembers;
    const set = new Set(serverMembers);
    for (const [spaceId, on] of activeOverride) {
      if (on) set.add(spaceId);
      else set.delete(spaceId);
    }
    return set;
  }, [activeOverride, serverMembers]);

  const toggle = async (
    spaceId: Id<"spaces">,
    next: boolean,
    undone = false,
  ) => {
    if (busyRef.current || !item || members.has(spaceId) === next) return;
    busyRef.current = true;
    setBusy(true);
    const previous = members.has(spaceId);
    setOverride((current) => {
      const values = new Map(current?.itemId === id ? current.values : []);
      values.set(spaceId, next);
      return { itemId: id, values };
    });
    const mutation = next ? addItemToSpace : removeItemFromSpace;
    try {
      await mutation({ itemId: id, spaceId });
      analytics.capture("item_space_membership_changed", {
        membership_added: next,
        item_id: id,
        space_id: spaceId,
        undone,
      });
      setLastChange(
        undone
          ? null
          : {
              itemId: id,
              spaceId,
              name:
                spaces?.find((space) => space._id === spaceId)?.name ?? "space",
              added: next,
            },
      );
    } catch {
      // Revert the optimistic override so the switch reflects server state.
      setOverride((current) => {
        if (current?.itemId !== id) return current;
        const values = new Map(current.values);
        values.set(spaceId, previous);
        return { itemId: id, values };
      });
      Alert.alert(t("spaces.changeFailed"), t("spaces.changeFailedBody"));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  // The item may be `null` (deleted, or not ours) — distinct from `undefined`
  // (still loading). A null item renders a non-interactive state instead of an
  // all-off switch list, since every toggle would fire a failing mutation.
  const loading = spaces === undefined || item === undefined;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.heading}>{t("navigation.spaces")}</Text>
      <Text style={styles.subheading}>{t("spaces.membershipHelp")}</Text>
      <Text style={styles.subheading}>{t("spaces.dismissedHelp")}</Text>

      {lastChange?.itemId === id ? (
        <View style={styles.undoRow} accessibilityLiveRegion="polite">
          <Text style={styles.rowLabel}>
            {t(lastChange.added ? "spaces.addedTo" : "spaces.removedFrom", {
              space: lastChange.name,
            })}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("spaces.undoChange")}
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            style={styles.undoButton}
            onPress={() =>
              void toggle(lastChange.spaceId, !lastChange.added, true)
            }
          >
            <Text style={styles.undoText}>{t("common.undo")}</Text>
          </Pressable>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator style={styles.spinner} />
      ) : item === null ? (
        <EmptyState
          title={t("common.unavailable")}
          message={t("item.unavailable")}
        />
      ) : spaces.length === 0 ? (
        <Text style={styles.empty}>{t("spaces.noneAvailable")}</Text>
      ) : (
        <View style={styles.list}>
          {spaces.map((space) => (
            <View key={space._id} style={styles.row}>
              <Text style={styles.rowLabel} numberOfLines={1}>
                {space.name}
              </Text>
              <Switch
                accessibilityLabel={space.name}
                disabled={busy}
                value={members.has(space._id)}
                onValueChange={(next) => toggle(space._id, next)}
              />
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  content: {
    flexGrow: 1,
    padding: theme.gap(2.5),
    paddingBottom: theme.gap(4),
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
  spinner: {
    marginVertical: theme.gap(3),
  },
  empty: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    color: theme.colors.muted,
    marginVertical: theme.gap(2),
  },
  list: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.gap(1.5),
    paddingVertical: theme.gap(1.5),
    paddingHorizontal: theme.gap(1.5),
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  rowLabel: {
    flex: 1,
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: theme.colors.foreground,
  },
  undoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
    paddingHorizontal: theme.gap(1.5),
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primarySoft,
  },
  undoButton: {
    minHeight: 44,
    minWidth: 60,
    justifyContent: "center",
    alignItems: "center",
  },
  undoText: {
    fontFamily: theme.fonts.bold,
    fontSize: 14,
    color: theme.colors.primaryText,
  },
}));
