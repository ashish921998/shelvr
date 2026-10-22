import { memo, type FC } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { TidyCard } from "./tidy-card";
import {
  CardAnimationProvider,
  type TidyAction,
} from "@/lib/tidy/card-animation";
import type { TidyPhoto } from "@/lib/tidy/use-photo-batch";

type Props = {
  photos: TidyPhoto[];
  onDecision: (index: number, action: TidyAction) => void;
};

const TidyDeckComponent: FC<Props> = ({ photos, onDecision }) => {
  const topStart = photos.length - 1;
  return (
    <View style={styles.deck}>
      {photos.map((photo, index) => (
        <CardAnimationProvider
          key={photo.id}
          index={index}
          onDecision={onDecision}
        >
          <TidyCard photo={photo} index={index} topStart={topStart} />
        </CardAnimationProvider>
      ))}
    </View>
  );
};

export const TidyDeck = memo(TidyDeckComponent);

const styles = StyleSheet.create({
  deck: {
    flex: 1,
  },
});
