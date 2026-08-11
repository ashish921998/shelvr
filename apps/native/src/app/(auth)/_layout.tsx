import { useConvexAuth } from 'convex/react';
import { Redirect, Stack } from 'expo-router';
import { ScreenLoader } from '@/components/ui/screen-loader';

export default function AuthRoutesLayout() {
  const { isLoading, isAuthenticated } = useConvexAuth();

  if (isLoading) {
    return <ScreenLoader label="Signing in" />;
  }

  if (isAuthenticated) {
    return <Redirect href={'/'} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
