import {
  Image,
  Rectangle,
  Spacer,
  Text,
  VStack,
  ZStack,
} from "@expo/ui/swift-ui";
import {
  aspectRatio,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  multilineTextAlignment,
  padding,
  resizable,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

export type TripCountdownWidgetProps = {
  scheme?: "shelvr" | "shelvr-dev" | "shelvr-preview";
  tripId?: string;
  label?: string;
  headline?: string;
  detail?: string;
  footnote?: string;
  imageUri?: string;
  emptyTitle?: string;
  emptyBody?: string;
};

const TripCountdownWidget = (
  props: TripCountdownWidgetProps,
  environment: WidgetEnvironment,
) => {
  "widget";
  const scheme =
    props.scheme === "shelvr-dev" || props.scheme === "shelvr-preview"
      ? props.scheme
      : "shelvr";
  const dark = environment.colorScheme === "dark";
  const c = dark
    ? {
        background: "#191510",
        foreground: "#f4eddd",
        muted: "#a2977f",
        accent: "#e6a23c",
      }
    : {
        background: "#faf6ee",
        foreground: "#2b2418",
        muted: "#6f6455",
        accent: "#b5761b",
      };

  if (!props.tripId || !props.headline) {
    return (
      <VStack
        spacing={6}
        modifiers={[
          padding({ horizontal: 12 }),
          containerBackground(c.background, "widget"),
          widgetURL(`${scheme}:///`),
        ]}
      >
        <Image systemName="airplane" size={22} color={c.muted} />
        <Text
          modifiers={[
            font({ size: 12, weight: "medium" }),
            foregroundStyle(c.foreground),
            multilineTextAlignment("center"),
          ]}
        >
          {props.emptyTitle ?? "Shelvr"}
        </Text>
        <Text
          modifiers={[
            font({ size: 10 }),
            foregroundStyle(c.muted),
            multilineTextAlignment("center"),
          ]}
        >
          {props.emptyBody ?? ""}
        </Text>
      </VStack>
    );
  }

  const photo = Boolean(props.imageUri);
  const strong = photo ? "#ffffff" : c.foreground;
  const soft = photo ? "#ffffffcc" : c.muted;
  const medium = environment.widgetFamily === "systemMedium";

  return (
    <ZStack
      alignment="bottomLeading"
      modifiers={[
        containerBackground(c.background, "widget"),
        widgetURL(`${scheme}:///trip-plan/${props.tripId}`),
      ]}
    >
      {props.imageUri ? (
        <Image
          uiImage={props.imageUri}
          modifiers={[
            resizable(),
            aspectRatio({ contentMode: "fill" }),
            frame({ maxWidth: Infinity, maxHeight: Infinity }),
          ]}
        />
      ) : null}
      {photo ? (
        <Rectangle
          modifiers={[
            foregroundStyle({
              type: "linearGradient",
              colors: ["#00000033", "#000000B3"],
              startPoint: { x: 0.5, y: 0 },
              endPoint: { x: 0.5, y: 1 },
            }),
          ]}
        />
      ) : null}
      <VStack
        alignment="leading"
        spacing={3}
        modifiers={[
          padding({ all: 14 }),
          frame({
            maxWidth: Infinity,
            maxHeight: Infinity,
            alignment: "topLeading",
          }),
        ]}
      >
        <Text
          modifiers={[
            font({ size: 12, weight: "semibold" }),
            foregroundStyle(photo ? "#ffffff" : c.accent),
            lineLimit(1),
          ]}
        >
          {props.label ?? ""}
        </Text>
        <Spacer />
        <Text
          modifiers={[
            font({ size: medium ? 24 : 20, weight: "bold" }),
            foregroundStyle(strong),
            lineLimit(2),
          ]}
        >
          {props.headline}
        </Text>
        {props.detail ? (
          <Text
            modifiers={[
              font({ size: 11, weight: "medium" }),
              foregroundStyle(soft),
              lineLimit(1),
            ]}
          >
            {props.detail}
          </Text>
        ) : null}
        {medium && props.footnote ? (
          <Text
            modifiers={[
              font({ size: 11 }),
              foregroundStyle(soft),
              lineLimit(1),
            ]}
          >
            {props.footnote}
          </Text>
        ) : null}
      </VStack>
    </ZStack>
  );
};

export default createWidget("TripCountdown", TripCountdownWidget);
