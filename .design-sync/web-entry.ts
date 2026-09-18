// The Shelvr components synced to Claude Design, compiled for the web through
// react-native-web by .design-sync/build-web.mjs. Add a component here to sync it.
//
// The theme import must stay first: it registers the unistyles themes that
// every component's StyleSheet.create reads.
import "@/unistyles";
import { UnistylesRuntime } from "react-native-unistyles";

// On web, unistyles registers each theme's CSS variables at configure time but
// only writes them into its <style> tag when the first style is applied. An
// identity theme update writes them at load, so var(--colors-*) and
// var(--fonts-*) resolve before any Shelvr component has mounted.
UnistylesRuntime.updateTheme("light", (theme) => theme);

export { AppSymbolIcon } from "@/components/symbol";
export { EmptyState } from "@/components/empty-state";
export { HeaderIconButton } from "@/components/ui/header-icon-button";
export { InlineCard } from "@/components/ui/inline-card";
export { IntentChip } from "@/components/intent-chip";
export { ScreenLoader } from "@/components/ui/screen-loader";
export { SuggestedBadge } from "@/components/suggested-badge";
export { TagChip } from "@/components/tag-chip";
export { Wordmark } from "@/components/wordmark";
