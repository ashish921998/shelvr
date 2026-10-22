import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { Component, type ReactNode } from "react";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { t } from "@/lib/i18n";

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
  const user = useQuery(api.users.getCurrentUser);
  if (user !== undefined && user !== null) throw error;
  return <ScreenLoader label={t("loading.app")} />;
}
