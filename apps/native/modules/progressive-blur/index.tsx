import { requireNativeView } from "expo";
import { useAppHeaderHeight } from "@/lib/header-layout";
import type { ComponentType } from "react";
import { Platform, StyleSheet, type ViewProps } from "react-native";

type NativeBlurProps = ViewProps & {
  // Points below the band over which the blur fades out. See `fadePastHeader`
  // on ProgressiveBlurHeader.
  fadePastHeader?: number;
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

  return (
    <NativeComponent
      pointerEvents="none"
      fadePastHeader={fadePastHeader}
      // The computed height spans the status bar + nav bar — exactly the
      // screen-top -> header-bottom band we want to blur.
      style={[
        StyleSheet.absoluteFill,
        { bottom: undefined, height: headerHeight },
      ]}
    />
  );
}
