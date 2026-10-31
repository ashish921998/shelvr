import { Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type Member = { firstName?: string; isYou: boolean };

const MAX_SHOWN = 3;

export function MemberAvatars({
  members,
  size = 32,
}: {
  members: Member[];
  size?: number;
}) {
  const { theme } = useUnistyles();
  const fills = [
    { background: theme.colors.foreground, text: theme.colors.surface },
    { background: theme.colors.primary, text: theme.colors.onTint },
    { background: theme.colors.surfaceMuted, text: theme.colors.foreground },
  ];
  const shown = [
    ...members.filter((member) => member.isYou),
    ...members.filter((member) => !member.isYou),
  ].slice(0, MAX_SHOWN);
  return (
    <View style={styles.stack} accessibilityElementsHidden>
      {shown.map((member, index) => {
        const fill = fills[index % fills.length];
        return (
          <View
            key={`${member.firstName ?? ""}-${index}`}
            style={[
              styles.avatar,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: fill.background,
                marginLeft: index === 0 ? 0 : -size * 0.4,
              },
            ]}
          >
            <Text style={[styles.letter, { color: fill.text }]}>
              {(member.firstName ?? "").slice(0, 1).toLocaleUpperCase()}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  stack: { flexDirection: "row", alignItems: "center" },
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: theme.colors.surface,
  },
  letter: { ...theme.type.captionStrong },
}));
