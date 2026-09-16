import {
  Canvas,
  Fill,
  ImageShader,
  Shader,
  Skia,
  useImage,
} from "@shopify/react-native-skia";
import { WELCOME_GLASS_SHADER } from "./welcome-glass-shader";
import { useCallback } from "react";
import { AppState, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
  cancelAnimation,
  Easing,
  useDerivedValue,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useUnistyles } from "react-native-unistyles";

const GLASS = Skia.RuntimeEffect.Make(WELCOME_GLASS_SHADER);

export function WelcomeGlass({ width }: { width: number }) {
  const { theme, rt } = useUnistyles();
  return (
    <GlassArtwork
      key={rt.themeName}
      width={width}
      background={theme.colors.background}
      foreground={theme.colors.foreground}
      accent={theme.colors.primary}
    />
  );
}

function GlassArtwork({
  width,
  background,
  foreground,
  accent,
}: {
  width: number;
  background: string;
  foreground: string;
  accent: string;
}) {
  const reduceMotion = useReducedMotion();
  const atlas = useImage(require("../../assets/welcome/saved-objects.png"));
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const arrival = useSharedValue(0);
  const phase = useSharedValue(reduceMotion ? Math.PI : 0);
  const paper = Array.from(Skia.Color(background));
  const ink = Array.from(Skia.Color(foreground));
  const amber = Array.from(Skia.Color(accent));
  const height = width * 0.96;

  const { setActive } = useFrameCallback((frame) => {
    const elapsed = Math.min(frame.timeSincePreviousFrame ?? 0, 64);
    phase.set((phase.get() + (elapsed / 16000) * Math.PI * 2) % (Math.PI * 2));
  }, false);

  useFocusEffect(
    useCallback(() => {
      arrival.set(
        reduceMotion
          ? 1
          : withTiming(1, {
              duration: 1600,
              easing: Easing.linear,
            }),
      );
      setActive(
        !reduceMotion && atlas !== null && AppState.currentState === "active",
      );
      const subscription = AppState.addEventListener("change", (state) => {
        setActive(!reduceMotion && atlas !== null && state === "active");
      });
      return () => {
        subscription.remove();
        setActive(false);
        cancelAnimation(arrival);
      };
    }, [arrival, atlas, reduceMotion, setActive]),
  );

  const uniforms = useDerivedValue(() => ({
    size: [width, height],
    offset: [x.get(), y.get()],
    arrival: arrival.get(),
    phase: phase.get(),
    paper,
    ink,
    amber,
  }));
  const gesture = Gesture.Pan()
    .enabled(!reduceMotion)
    .activeOffsetX([-8, 8])
    .failOffsetY([-12, 12])
    .onChange((event) => {
      x.set(
        Math.max(
          -width * 0.15,
          Math.min(width * 0.15, x.get() + event.changeX * 0.35),
        ),
      );
      y.set(
        Math.max(
          -height * 0.1,
          Math.min(height * 0.1, y.get() + event.changeY * 0.35),
        ),
      );
    })
    .onFinalize((event) => {
      x.set(
        withSpring(0, {
          damping: 20,
          stiffness: 150,
          velocity: event.velocityX * 0.35,
        }),
      );
      y.set(
        withSpring(0, {
          damping: 20,
          stiffness: 150,
          velocity: event.velocityY * 0.35,
        }),
      );
    });

  if (!GLASS || !atlas) return <View style={{ width, height }} />;

  return (
    <GestureDetector gesture={gesture}>
      <View
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Canvas style={{ width, height }}>
          <Fill>
            <Shader source={GLASS} uniforms={uniforms}>
              <ImageShader
                image={atlas}
                fit="fill"
                rect={{ x: 0, y: 0, width: 1, height: 1 }}
              />
            </Shader>
          </Fill>
        </Canvas>
      </View>
    </GestureDetector>
  );
}
