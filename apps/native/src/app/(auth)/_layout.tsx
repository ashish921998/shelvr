import { t, useAppLocale } from "@/lib/i18n";
import { useConvexAuth } from "convex/react";
import { Redirect, Stack } from "expo-router";
import { ScreenLoader } from "@/components/ui/screen-loader";

export default function AuthRoutesLayout() {
  useAppLocale();
  const { isLoading, isAuthenticated } = useConvexAuth();

  if (isLoading) {
    return <ScreenLoader label={t("account.signingIn")} />;
  }

  if (isAuthenticated) {
    return <Redirect href={"/"} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
