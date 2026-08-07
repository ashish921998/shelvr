import { useConvexAuth } from 'convex/react';
import { Redirect, Stack } from 'expo-router';

export default function AuthRoutesLayout() {
  const { isLoading, isAuthenticated } = useConvexAuth();

  if (isLoading) {
    return null;
  }

  if (isAuthenticated) {
    return <Redirect href={'/'} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
