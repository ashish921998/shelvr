import { t } from "@/lib/i18n";
import type { FreeSaves } from "@/lib/access";

export function freeSavesTitle({
  open,
  left,
  limit,
}: Pick<FreeSaves, "open" | "left" | "limit">): string {
  if (!open) return t("pro.unlockShelvr");
  return left > 0
    ? t("freePlan.leftTitle", { count: left })
    : t("freePlan.usedTitle", { limit });
}
