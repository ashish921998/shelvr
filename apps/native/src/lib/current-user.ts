import { api } from '@convex/_generated/api';
import { convexQuery } from '@convex-dev/react-query';
import { useConvexAuth } from 'convex/react';
import { useQuery } from '@tanstack/react-query';

export function useCurrentUser() {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(convexQuery(api.users.getCurrentUser, isAuthenticated ? {} : 'skip'));
}
