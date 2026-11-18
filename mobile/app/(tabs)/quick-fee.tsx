import { View, useColorScheme } from 'react-native';
import { Colors } from '../../constants/theme';

export default function QuickFeePlaceholder() {
  const colors = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  return <View style={{ flex: 1, backgroundColor: colors.background }} />;
}
