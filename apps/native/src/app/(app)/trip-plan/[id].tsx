import { EmptyState } from "@/components/empty-state";
import {
  hasMapPoints,
  TripPlanBody,
} from "@/components/trip-planner/trip-plan-body";
import {
  TripEditHeader,
  TripEditList,
  TripUndoBar,
} from "@/components/trip-planner/trip-edit-list";
import {
  HeaderActionMenu,
  HeaderIconButton,
} from "@/components/ui/header-icon-button";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { analytics } from "@/lib/analytics";
import { useDeleteTripPlan } from "@/lib/delete-trip-plan";
import { t, useAppLocale } from "@/lib/i18n";
import { backOrHome } from "@/lib/screen-dismiss";
import { useRenameTrip, useTripEditor } from "@/lib/trip-edit";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { TripPlanDetail } from "@convex/model/tripPlan";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

function TripHeader({
  overMap,
  editing,
  onEdit,
  onDone,
  onAddPlace,
  onDelete,
}: {
  overMap: boolean;
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
  onAddPlace: () => void;
  onDelete: () => void;
}) {
  const { theme } = useUnistyles();
  const actions = [
    { label: t("tripPlanner.edit"), onPress: onEdit },
    { label: t("tripPlanner.addPlace"), onPress: onAddPlace },
    { label: t("tripPlanner.delete"), destructive: true, onPress: onDelete },
  ];
  if (Platform.OS === "android") {
    return (
      <Stack.Screen
        options={{
          // Over the map the header floats; without one it needs its own background.
          headerTransparent: overMap && !editing,
          headerStyle:
            overMap && !editing
              ? undefined
              : { backgroundColor: theme.colors.background },
          headerRight: () =>
            editing ? (
              <HeaderIconButton
                icon="checkmark"
                label={t("common.done")}
                onPress={onDone}
              />
            ) : (
              <HeaderActionMenu
                icon="ellipsis"
                label={t("tripPlanner.tripActions")}
                title={t("tripPlanner.tripActions")}
                actions={actions}
              />
            ),
        }}
      />
    );
  }
  if (editing) {
    return (
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="checkmark"
          tintColor={theme.colors.primary}
          onPress={onDone}
        >
          {t("common.done")}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
    );
  }
  return (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Menu icon="ellipsis" tintColor={theme.colors.foreground}>
        <Stack.Toolbar.MenuAction icon="pencil" onPress={onEdit}>
          {t("tripPlanner.edit")}
        </Stack.Toolbar.MenuAction>
        <Stack.Toolbar.MenuAction icon="plus" onPress={onAddPlace}>
          {t("tripPlanner.addPlace")}
        </Stack.Toolbar.MenuAction>
        <Stack.Toolbar.MenuAction icon="trash" destructive onPress={onDelete}>
          {t("tripPlanner.delete")}
        </Stack.Toolbar.MenuAction>
      </Stack.Toolbar.Menu>
    </Stack.Toolbar>
  );
}

/** Edit mode: the trip's name, its days as draggable rows, and Undo for the last change. */
function TripEditor({
  trip,
  onAddPlace,
  name,
  onChangeName,
  onSubmitName,
}: {
  trip: TripPlanDetail;
  onAddPlace: (day: number) => void;
  name: string;
  onChangeName: (name: string) => void;
  onSubmitName: () => void;
}) {
  const editor = useTripEditor(trip);
  return (
    <TripEditList
      trip={trip}
      editor={editor}
      onAddPlace={onAddPlace}
      header={
        <TripEditHeader
          city={trip.city}
          name={name}
          onChangeName={onChangeName}
          onSubmitName={onSubmitName}
        />
      }
      footer={
        <TripUndoBar undo={editor.undo} onUndo={() => void editor.undoLast()} />
      }
    />
  );
}

export default function TripPlanScreen() {
  useAppLocale();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const tripId = id as Id<"tripPlans">;
  const trip = useQuery(
    convexQuery(api.tripPlannerData.getTripPlan, { tripId }),
  );
  const deleteTrip = useDeleteTripPlan();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const rename = useRenameTrip(tripId, trip.data?.name);

  const data = trip.data;
  const opened = useRef(false);
  useEffect(() => {
    if (!data || opened.current) return;
    opened.current = true;
    const stops = data.days.flat();
    analytics.capture("trip_plan_opened", {
      days: data.dayCount,
      stops: stops.length,
      saved: stops.filter((stop) => stop.source === "save").length,
    });
  }, [data]);

  // Without a title VoiceOver read the tab group's route name, "(tabs)".
  const backTitle = (
    <Stack.Screen options={{ headerBackTitle: t("common.back") }} />
  );
  if (trip.isError) {
    return (
      <>
        {backTitle}
        <EmptyState
          title={t("errors.unexpectedTitle")}
          message={t("errors.retrySoon")}
        />
      </>
    );
  }
  if (data === undefined) {
    return (
      <>
        {backTitle}
        <ScreenLoader label={t("trip.loading")} />
      </>
    );
  }
  if (data === null) {
    return (
      <View style={styles.screen}>
        {backTitle}
        <EmptyState
          title={t("tripPlanner.goneTitle")}
          message={t("tripPlanner.goneBody")}
        />
      </View>
    );
  }

  const addPlace = (day: number) =>
    router.push({
      pathname: "/add-trip-stop",
      params: { tripId: data._id, day: String(day) },
    });
  return (
    <>
      {backTitle}
      <TripHeader
        overMap={hasMapPoints(data)}
        editing={editing}
        onEdit={() => {
          analytics.capture("trip_plan_edit_started", {
            stops: data.days.flat().length,
          });
          setName(data.name ?? "");
          setEditing(true);
        }}
        onDone={() => {
          if (name !== null) void rename(name);
          setEditing(false);
        }}
        onAddPlace={() => addPlace(1)}
        onDelete={() => deleteTrip(data._id, () => backOrHome(router))}
      />
      {editing ? (
        <TripEditor
          trip={data}
          onAddPlace={addPlace}
          name={name ?? ""}
          onChangeName={setName}
          onSubmitName={() => {
            if (name !== null) void rename(name);
          }}
        />
      ) : (
        <TripPlanBody trip={data} />
      )}
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
}));
