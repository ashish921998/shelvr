import {
  createContext,
  useContext,
  useMemo,
  type FC,
  type PropsWithChildren,
} from "react";
import { useSharedValue, type SharedValue } from "react-native-reanimated";

type DeckAnimationValue = {
  isDragging: SharedValue<boolean>;
  animatedIndex: SharedValue<number>;
  currentIndex: SharedValue<number>;
  undoIndex: SharedValue<number | null>;
};

const DeckAnimationContext = createContext<DeckAnimationValue | null>(null);

type Props = PropsWithChildren<{
  lastIndex: number;
}>;

export const DeckAnimationProvider: FC<Props> = ({ lastIndex, children }) => {
  const isDragging = useSharedValue(false);
  const animatedIndex = useSharedValue(lastIndex);
  const currentIndex = useSharedValue(lastIndex);
  const undoIndex = useSharedValue<number | null>(null);

  const value = useMemo(
    () => ({ isDragging, animatedIndex, currentIndex, undoIndex }),
    [isDragging, animatedIndex, currentIndex, undoIndex],
  );

  return (
    <DeckAnimationContext.Provider value={value}>
      {children}
    </DeckAnimationContext.Provider>
  );
};

export const useDeckAnimation = () => {
  const context = useContext(DeckAnimationContext);
  if (!context) {
    throw new Error(
      "useDeckAnimation must be used within a DeckAnimationProvider",
    );
  }
  return context;
};
