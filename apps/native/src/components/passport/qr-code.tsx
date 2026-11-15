import { darkRuns, qrModules } from "@/lib/passport-story";
import { useMemo } from "react";
import { View } from "react-native";

export function QrCode({
  value,
  size,
  color,
  background,
  radius = 0,
}: {
  value: string;
  size: number;
  color: string;
  background: string;
  radius?: number;
}) {
  const rows = useMemo(() => qrModules(value), [value]);
  const cell = size / (rows.length + 2);
  return (
    <View
      testID="qr-code"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        padding: cell,
        borderRadius: radius,
        backgroundColor: background,
      }}
    >
      {rows.map((row, index) => (
        <View key={index} style={{ height: cell, flexDirection: "row" }}>
          {darkRuns(row).map(([start, length]) => (
            <View
              key={start}
              style={{
                position: "absolute",
                left: start * cell,
                width: length * cell + 0.5,
                height: cell + 0.5,
                backgroundColor: color,
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
