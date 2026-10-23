import type { ReactNode } from "react";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { t } from "@/lib/i18n";
import { useNotificationSession } from "@/lib/notifications";

export function AccountDeletionGate({ children }: { children: ReactNode }) {
  const { operation } = useNotificationSession();
  return operation === "delete_account" ? (
    <ScreenLoader label={t("account.deleting")} />
  ) : (
    children
  );
}
