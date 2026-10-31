import { UndoBar } from "@/components/ui/undo-bar";
import { t } from "@/lib/i18n";
import type { usePlaceRemoval } from "@/lib/place-removal";

export function PlaceRemovalUndo({
  removal,
}: {
  removal: ReturnType<typeof usePlaceRemoval>;
}) {
  return (
    <UndoBar
      message={
        removal.undo
          ? t("cityMap.removedPlace", { name: removal.undo.name })
          : null
      }
      onUndo={() => void removal.restore()}
      disabled={removal.busy}
      raised
    />
  );
}
