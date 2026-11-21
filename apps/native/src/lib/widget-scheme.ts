import Constants from "expo-constants";

export type WidgetScheme = "shelvr" | "shelvr-dev" | "shelvr-preview";

export function widgetScheme(): WidgetScheme {
  const variant = Constants.expoConfig?.extra?.variant;
  if (variant === "production") return "shelvr";
  return variant === "preview" ? "shelvr-preview" : "shelvr-dev";
}
