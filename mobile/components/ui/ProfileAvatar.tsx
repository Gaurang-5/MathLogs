import { useState } from 'react';
import { Image, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { Colors, FontWeight } from '../../constants/theme';

/** Decorative identity mark; the containing profile control provides its accessible name. */
export function ProfileAvatar({ logoUri, name, size = 40 }: { logoUri?: string | null; name: string; size?: number }) {
  const colors = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = words.length > 0
    ? `${Array.from(words[0])[0] ?? ''}${words.length > 1 ? Array.from(words[words.length - 1])[0] ?? '' : ''}`.toLocaleUpperCase()
    : 'T';

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceSecondary }]}>
      {logoUri && logoUri !== failedUri ? (
        <Image source={{ uri: logoUri }} resizeMode="contain" onError={() => setFailedUri(logoUri)} style={{ width: size, height: size }} accessible={false} />
      ) : (
        <Text allowFontScaling={false} style={{ color: colors.text, fontSize: size * 0.36, fontWeight: FontWeight.semibold }}>{initials}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
