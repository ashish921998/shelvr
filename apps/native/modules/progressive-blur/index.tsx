import { requireNativeView } from "expo";
import { useAppHeaderHeight } from "@/lib/header-layout";
import { withAlpha } from "@/lib/tab-bar-motion";
import type { ComponentType } from "react";
import { Platform, StyleSheet, View, type ViewProps } from "react-native";
import { useUnistyles } from "react-native-unistyles";

type NativeBlurProps = ViewProps & {
  // Points below the band over which the blur fades out. See `fadePastHeader`
  // on ProgressiveBlurHeader.
  fadePastHeader?: number;
  // The page background laid over the blur, so the band stays the page's
  // colour instead of the system chrome grey.
  pageColor?: string;
};

// View modules resolve on iOS only; on Android (or an unlinked build) there's no
// native view to require, so the component below no-ops.
const NativeBlur =
  Platform.OS === "ios"
    ? requireNativeView<NativeBlurProps>("ProgressiveBlur")
    : null;

/**
 * A blurred band pinned to the top of the screen, sized to the
 * navigation header. Sits behind the (transparent) native header so scrolling
 * content dissolves into blur as it passes underneath, and the band's opacity
 * feathers out to clear near the header's bottom edge.
 *
 * This renders a standard public UIBlurEffect whose opacity feathers out across
 * the band via a gradient mask. iOS exposes no public API for a true
 * spatially-varying blur radius, so the falloff is an opacity fade rather than a
 * per-pixel radius change.
 *
 * Drop it in as an absolutely-positioned sibling AFTER the scrolling content so
 * it stays pinned while the feed scrolls beneath it.
 *
 * @param fadePastHeader Points below the band over which the blur fades out.
 * Left unset, the fade happens inside the band, which reads at full strength
 * over the status bar and has largely dissolved by the navigation bar. That
 * suits a header carrying a short title over wide content, but a header whose
 * own text fills the band (a title stacked over a date) then sits in front of
 * barely-blurred content. Passing a small value holds the blur across the whole
 * band and finishes the fade that far into the content instead.
 */
export function ProgressiveBlurHeader({
  fadePastHeader,
}: { fadePastHeader?: number } = {}) {
  if (!NativeBlur) return null;

  return (
    <IOSProgressiveBlurHeader
      NativeComponent={NativeBlur}
      fadePastHeader={fadePastHeader}
    />
  );
}

function IOSProgressiveBlurHeader({
  NativeComponent,
  fadePastHeader,
}: {
  NativeComponent: ComponentType<NativeBlurProps>;
  fadePastHeader: number | undefined;
}) {
  const headerHeight = useAppHeaderHeight();
  const { theme } = useUnistyles();

  return (
    <NativeComponent
      pointerEvents="none"
      fadePastHeader={fadePastHeader}
      pageColor={theme.colors.background}
      // The computed height spans the status bar + nav bar — exactly the
      // screen-top -> header-bottom band we want to blur.
      style={[
        StyleSheet.absoluteFill,
        { bottom: undefined, height: headerHeight },
      ]}
    />
  );
}

/**
 * The band behind the transparent header on screens whose stack sets
 * `scrollEdgeEffects: { top: "soft" }`. Render it as a sibling AFTER the
 * scrolling content, so the scroll view stays the screen's first descendant
 * (the native edge effect relies on that).
 *
 * A page-colored fade: solid under the status bar, eased out just past the
 * header. On iOS 26 it sits over the native soft edge, which only washes
 * content lightly and would leave photos visible behind the title; below iOS
 * 26 the fade alone does the job. Android renders nothing: its header is an
 * opaque bar.
 */
export function ScrollEdgeHeader() {
  return Platform.OS === "ios" ? <HeaderFade /> : null;
}

// How far past the header's bottom edge the fade keeps going.
const FADE_TAIL = 24;

function HeaderFade() {
  const headerHeight = useAppHeaderHeight();
  // Read in render, not in StyleSheet.create: Unistyles doesn't re-apply
  // `experimental_backgroundImage` on a live theme change.
  const { theme } = useUnistyles();
  const bg = theme.colors.background;
  // Eased so the fade has no visible band where it ends.
  const stops = [
    `${bg} 0%`,
    `${bg} 40%`,
    `${withAlpha(bg, 0.85)} 62%`,
    `${withAlpha(bg, 0.45)} 82%`,
    `${withAlpha(bg, 0.12)} 94%`,
    `${withAlpha(bg, 0)} 100%`,
  ];

  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          bottom: undefined,
          height: headerHeight + FADE_TAIL,
          experimental_backgroundImage: `linear-gradient(to bottom, ${stops.join(", ")})`,
        },
      ]}
    />
  );
}
