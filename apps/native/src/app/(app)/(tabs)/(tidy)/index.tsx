import { t, useAppLocale } from "@/lib/i18n";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { usePermissions, type PermissionResponse } from "expo-media-library";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState, type FC } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/shelf/screen-header";
import { ShelfRow } from "@/components/shelf/shelf-row";
import { Eyebrow, Gutter } from "@/components/shelf/typography";
import { useInkClock } from "@/lib/ink/use-ink-clock";
import {
  HeaderActionMenu,
  HeaderIconButton,
} from "@/components/ui/header-icon-button";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { ProGate as ProGateView } from "@/components/pro-gate";
import { TidyDeck } from "@/components/tidy/tidy-deck";
import { TidyDone } from "@/components/tidy/tidy-done";
import { useEntitlement } from "@/lib/entitlement";
import {
  DeckAnimationProvider,
  useDeckAnimation,
} from "@/lib/tidy/deck-animation";
import { getSelectedAlbumId, setSelectedAlbumId } from "@/lib/tidy/storage";
import {
  ALL_PHOTOS_ID,
  useAlbums,
  type TidySource,
} from "@/lib/tidy/use-albums";
import { usePhotoBatch, type TidyPhoto } from "@/lib/tidy/use-photo-batch";
import { useTidyActions } from "@/lib/tidy/use-tidy-actions";

export default function TidyScreen() {
  const { entitled, loading: entitlementLoading } = useEntitlement();
  const [permission, requestPermission] = usePermissions({
    granularPermissions: ["photo"],
  });
  const granted = permission?.granted ?? false;

  const sources = useAlbums(granted);
  const [selectedId, setSelectedId] = useState<string>(
    () => getSelectedAlbumId() ?? ALL_PHOTOS_ID,
  );
  const source = useMemo(
    () => sources.find((s) => s.id === selectedId) ?? sources[0],
    [sources, selectedId],
  );

  const { batch, batchId, loading, loadNextBatch, noteDeleted } = usePhotoBatch(
    {
      album: source.album,
      sourceId: source.id,
      enabled: granted && !entitlementLoading && entitled,
    },
  );

  const selectSource = useCallback((id: string) => {
    setSelectedId(id);
    setSelectedAlbumId(id === ALL_PHOTOS_ID ? null : id);
  }, []);

  if (!permission || entitlementLoading) {
    return <Loading />;
  }

  // Tidy is a Pro feature. A lapsed user sees a paywall CTA instead of the deck.
  if (!entitled) {
    return <ProGate />;
  }

  if (!granted) {
    return (
      <PermissionGate
        permission={permission}
        requestPermission={requestPermission}
      />
    );
  }

  // `loading` is true until the batch for the active source has resolved
  // (initial grant or a source switch), which avoids showing a stale deck.
  if (loading || batch === null) {
    return <Loading />;
  }

  return (
    // Keyed by batch so every batch remounts fresh shared values and deck
    // state — indices always start at the top card.
    <DeckAnimationProvider key={batchId} lastIndex={batch.length - 1}>
      <TidyDeckView
        batch={batch}
        sources={sources}
        selectedId={source.id}
        selectSource={selectSource}
        limitedAccess={permission.accessPrivileges === "limited"}
        loadNextBatch={loadNextBatch}
        noteDeleted={noteDeleted}
      />
    </DeckAnimationProvider>
  );
}

type DeckViewProps = {
  batch: TidyPhoto[];
  sources: TidySource[];
  selectedId: string;
  selectSource: (id: string) => void;
  limitedAccess: boolean;
  loadNextBatch: () => Promise<void>;
  noteDeleted: (count: number) => void;
};

const TidyDeckView: FC<DeckViewProps> = ({
  batch,
  sources,
  selectedId,
  selectSource,
  limitedAccess,
  loadNextBatch,
  noteDeleted,
}) => {
  useAppLocale();
  const { width } = useWindowDimensions();
  const clock = useInkClock();
  const { undoIndex } = useDeckAnimation();
  const {
    topIndex,
    counts,
    shelved,
    pendingDeleteCount,
    canUndo,
    onDecision,
    undo,
    commitDeletes,
  } = useTidyActions({ batch, noteDeleted });
  const [continuing, setContinuing] = useState(false);

  // Leaving the tab (or backgrounding the screen) flushes queued deletions so
  // the batch never silently outlives the session.
  useFocusEffect(
    useCallback(() => {
      return () => {
        commitDeletes();
      };
    }, [commitDeletes]),
  );

  const handleUndo = () => {
    const index = undo();
    if (index === null) return;
    if (process.env.EXPO_OS === "ios") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    undoIndex.set(index);
  };

  const handleContinue = async () => {
    setContinuing(true);
    try {
      await commitDeletes();
      await loadNextBatch();
    } finally {
      setContinuing(false);
    }
  };

  const currentSource = sources.find((s) => s.id === selectedId) ?? sources[0];
  const batchDone = topIndex < 0;
  const reviewedCount = batch.length - 1 - topIndex;

  return (
    <View style={styles.container}>
      {/* Undo on the left, the source and progress in the middle, the delete
          queue and the album picker on the right. The progress counter used to
          sit under the header; it is the header's summary line now. */}
      <ScreenHeader
        clock={clock}
        title={t("navigation.tidyHeader")}
        subtitle={`${currentSource.title} · ${Math.min(reviewedCount, batch.length)} / ${batch.length}`}
        left={
          canUndo ? (
            <HeaderIconButton
              icon="arrow.uturn.backward"
              label={t("common.undo")}
              onPress={handleUndo}
            />
          ) : null
        }
        right={
          <>
            {pendingDeleteCount > 0 ? (
              <HeaderIconButton
                icon="trash"
                label={t("tidy.confirmDelete")}
                badge={pendingDeleteCount}
                onPress={commitDeletes}
              />
            ) : null}
            <HeaderActionMenu
              icon="photo.on.rectangle.angled"
              label={
                limitedAccess ? t("albums.chooseLimited") : t("albums.choose")
              }
              title={t("albums.source")}
              actions={[
                ...sources.map((source) => ({
                  id: source.id,
                  label:
                    source.id === selectedId
                      ? `${source.title} \u2713`
                      : source.title,
                  onPress: () => selectSource(source.id),
                })),
                ...(limitedAccess
                  ? [
                      {
                        id: "manage-photo-access",
                        label: t("albums.manageAccessAction"),
                        onPress: () => Linking.openSettings(),
                      },
                    ]
                  : []),
              ]}
            />
          </>
        }
      />

      {/* What you have shelved in this batch, standing on a drawn board so the
          pile is visible as it grows. */}
      {shelved.length > 0 ? (
        <View style={styles.shelvedRow}>
          <Gutter>
            <Eyebrow>{`${t("tidy.shelved")} \u00b7 ${shelved.length}`}</Eyebrow>
          </Gutter>
          <ShelfRow
            width={width}
            clock={clock}
            testID="tidy-shelved"
            cards={shelved.slice(-8).map((photo) => ({
              key: photo.id,
              // `id` is the asset URI (ph:// or content://), renderable directly.
              imageUrl: photo.id,
              mark: "photo" as const,
              aspectRatio:
                photo.width && photo.height
                  ? photo.width / photo.height
                  : undefined,
            }))}
          />
        </View>
      ) : null}

      <View style={styles.deckArea}>
        <TidyDeck photos={batch} onDecision={onDecision} />
        {batchDone && (
          <TidyDone
            counts={counts}
            pendingDeleteCount={pendingDeleteCount}
            sourceTitle={currentSource.title}
            empty={batch.length === 0}
            loading={continuing}
            onContinue={handleContinue}
          />
        )}
      </View>
    </View>
  );
};

const PermissionGate: FC<{
  permission: PermissionResponse;
  requestPermission: () => Promise<PermissionResponse>;
}> = ({ permission, requestPermission }) => {
  useAppLocale();
  const handlePress = () => {
    if (permission.canAskAgain) {
      requestPermission();
    } else {
      Linking.openSettings();
    }
  };

  return (
    <View style={styles.gate}>
      <EmptyState title={t("tidy.introTitle")} message={t("tidy.introBody")} />
      <Pressable style={styles.gateButton} onPress={handlePress}>
        <Text style={styles.gateButtonText}>
          {permission.canAskAgain
            ? t("permissions.allowPhotos")
            : t("permissions.openSettings")}
        </Text>
      </Pressable>
    </View>
  );
};

const Loading: FC = () => <ScreenLoader label={t("loading.tidy")} />;

/** Pro gate shown to lapsed users on the Tidy tab. */
const ProGate: FC = () => (
  <ProGateView title={t("tidy.proTitle")} message={t("tidy.proBody")} />
);

const styles = StyleSheet.create((theme, rt) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  headerActions: {
    flexDirection: "row",
    gap: theme.gap(1),
  },
  shelvedRow: { gap: 8, paddingTop: 8, paddingBottom: 4 },
  progressRow: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: rt.insets.top + theme.gap(6),
    paddingBottom: theme.gap(1),
  },
  progressText: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: theme.colors.muted,
  },
  deckArea: {
    flex: 1,
    marginHorizontal: theme.gap(2),
    // Clear the floating native tab bar with a comfortable gap (note 5).
    marginBottom: rt.insets.bottom + theme.gap(11),
  },
  gate: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingBottom: theme.gap(6),
  },
  gateButton: {
    alignSelf: "center",
    marginBottom: theme.gap(6),
    paddingHorizontal: theme.gap(3),
    paddingVertical: theme.gap(1.5),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.primary,
  },
  gateButtonText: {
    fontFamily: theme.fonts.bold,
    fontSize: 16,
    color: "white",
  },
}));
