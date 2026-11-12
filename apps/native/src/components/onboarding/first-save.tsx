import { StatementStep } from "@/components/onboarding/statement";
import { t } from "@/lib/i18n";
import { useEffect } from "react";
import { useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const PIECES = Array.from({ length: 26 }, (_, index) => ({
  id: index,
  x: ((index * 61) % 380) / 380,
  width: 8 + (index % 3) * 5,
  fall: 1600 + (index % 7) * 260,
  delay: (index % 9) * 90,
  turn: (index * 37) % 180,
  tone: index % 4,
}));

function Piece({
  piece,
  color,
  height,
  width,
}: {
  piece: (typeof PIECES)[number];
  color: string;
  height: number;
  width: number;
}) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(
      piece.delay,
      withTiming(1, { duration: piece.fall, easing: Easing.in(Easing.quad) }),
    );
  }, [progress, piece]);
  const style = useAnimatedStyle(() => ({
    opacity: 1 - progress.value * progress.value,
    transform: [
      { translateY: -24 + progress.value * (height + 48) },
      { rotate: `${piece.turn + progress.value * 360}deg` },
    ],
  }));
  return (
    <Animated.View
      style={[
        styles.piece,
        {
          left: piece.x * width,
          width: piece.width,
          height: piece.width * 1.6,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

function Confetti() {
  const { theme } = useUnistyles();
  const { width, height } = useWindowDimensions();
  const colors = [
    theme.colors.primary,
    theme.colors.primarySoft,
    theme.colors.primaryText,
    theme.colors.keep,
  ];
  return (
    <View pointerEvents="none" style={styles.confetti}>
      {PIECES.map((piece) => (
        <Piece
          key={piece.id}
          piece={piece}
          color={colors[piece.tone]}
          height={height}
          width={width}
        />
      ))}
    </View>
  );
}

export function FirstSaveStep({ onContinue }: { onContinue: () => void }) {
  const reduced = useReducedMotion();
  return (
    <StatementStep
      centered
      text={t("onboardingStatement.firstSave")}
      onContinue={onContinue}
    >
      {reduced ? null : <Confetti />}
    </StatementStep>
  );
}

const styles = StyleSheet.create({
  confetti: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  piece: { position: "absolute", top: 0, borderRadius: 2 },
});
