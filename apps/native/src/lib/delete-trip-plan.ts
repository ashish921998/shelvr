import { analytics } from "@/lib/analytics";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useCallback } from "react";
import { Alert } from "react-native";

/** Deleting a trip can't be undone, so it asks first; `onDeleted` runs once it is gone. */
export function useDeleteTripPlan() {
  const deleteTripPlan = useMutation(api.tripPlannerData.deleteTripPlan);
  return useCallback(
    (tripId: Id<"tripPlans">, onDeleted?: () => void) => {
      const remove = async () => {
        try {
          await deleteTripPlan({ tripId });
          void haptics.success();
          analytics.capture("trip_plan_deleted", {});
          onDeleted?.();
        } catch (error) {
          analytics.captureError("delete_trip_plan_failed", error);
          Alert.alert(t("tripPlanner.deleteFailed"));
        }
      };
      Alert.alert(t("tripPlanner.deleteTitle"), t("tripPlanner.deleteBody"), [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => void remove(),
        },
      ]);
    },
    [deleteTripPlan],
  );
}
