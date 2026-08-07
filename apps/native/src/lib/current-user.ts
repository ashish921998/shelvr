import { api } from '@convex/_generated/api';
import { convexQuery } from '@convex-dev/react-query';
import { useConvexAuth } from 'convex/react';
import { useQuery } from '@tanstack/react-query';

export const currentUserQuery = convexQuery(api.users.getCurrentUser, {});

export function useCurrentUser() {
  const { isAuthenticated } = useConvexAuth();
  return useQuery({
    ...currentUserQuery,
    enabled: isAuthenticated,
  });
}
