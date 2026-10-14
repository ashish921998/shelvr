import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { Component, type ReactNode } from "react";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { t } from "@/lib/i18n";

/**
 * Holds the loader, not the crash screen, when the signed-in tree throws
 * because this account was deleted from another device.
 *
 * Deletion makes every query reject this device's still-valid token, and the
 * home feed's `usePaginatedQuery` rethrows that during render. The fallback
 * asks the server whether the account still exists. While the answer is
 * pending or the account is gone it shows the app loader, and
 * `useSignOutWhenAccountGone` signs the app out. That usually unmounts this
 * boundary; mid-onboarding the tree stays mounted, so the sign-out edge clears
 * the failure and remounts the children with their queries skipped. Only that
 * edge resets: signing in must not remount the tree under it. Any other error
 * is rethrown to the root boundary unchanged.
 */
export class AccountGoneBoundary extends Component<
  { signedIn: boolean; children: ReactNode },
  { error: unknown; failed: boolean }
> {
  state = { error: undefined as unknown, failed: false };

  static getDerivedStateFromError(error: unknown) {
    return { error, failed: true };
  }

  componentDidUpdate(previous: { signedIn: boolean }) {
    if (previous.signedIn && !this.props.signedIn && this.state.failed) {
      this.setState({ error: undefined, failed: false });
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <AccountGoneFallback error={this.state.error} />;
  }
}

function AccountGoneFallback({ error }: { error: unknown }) {
  // convex/react, not the TanStack adapter: it reads the same client cache the
  // failed query was answered from, so a deletion is visible on first render.
  const user = useQuery(api.users.getCurrentUser);
  if (user !== undefined && user !== null) throw error;
  return <ScreenLoader label={t("loading.app")} />;
}
