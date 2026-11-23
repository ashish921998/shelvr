import { SharedListCard } from "@/components/shared-list/list-card";
import { useSharedLists, type SharedListSummary } from "@/lib/shared-lists";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function SharedListCards({ lists }: { lists: SharedListSummary[] }) {
  return lists.slice(0, 2).map((list) => (
    <View key={list._id} style={styles.card}>
      <SharedListCard list={list} />
    </View>
  ));
}

export function MapSharedLists() {
  const { data } = useSharedLists();
  if (!data?.length) return null;
  return (
    <View style={styles.stack} pointerEvents="box-none">
      <SharedListCards lists={data} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  stack: {
    paddingHorizontal: theme.gap(2),
    paddingBottom: theme.gap(1),
    gap: theme.gap(1),
  },
  card: {
    borderRadius: theme.radius.lg,
    boxShadow: "0 4px 14px rgba(0, 0, 0, 0.12)",
  },
}));
