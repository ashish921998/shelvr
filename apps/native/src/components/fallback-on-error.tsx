import { analytics } from "@/lib/analytics";
import { Component, type ReactNode } from "react";

type Props = {
  /** Error-tracking event name for the caught render error. */
  event: string;
  /** Rendered instead of `children` once they throw. */
  fallback: ReactNode;
  children: ReactNode;
};

/**
 * Keeps an optional part of a screen from taking the whole screen down. A
 * render error in `children` is reported once and `fallback` shows instead.
 * Use it around UI that depends on a backend function an older deployment
 * may not have yet, so a client that lands first degrades instead of
 * crashing.
 */
export class FallbackOnError extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    analytics.captureError(this.props.event, error);
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
