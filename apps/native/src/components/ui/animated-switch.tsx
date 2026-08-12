import { Host, Switch } from '@expo/ui';
import { useUnistyles } from 'react-native-unistyles';

type Props = {
  value: boolean;
  onValueChange: (value: boolean) => void;
};

export function AnimatedSwitch({ value, onValueChange }: Props) {
  const { theme } = useUnistyles();
  return (
    <Host matchContents seedColor={theme.colors.primary}>
      <Switch value={value} onValueChange={onValueChange} />
    </Host>
  );
}
