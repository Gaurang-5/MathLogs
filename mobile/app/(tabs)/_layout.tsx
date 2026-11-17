import { StatusBar, useColorScheme } from 'react-native';
import { Tabs } from 'expo-router';
import { AdaptiveGlassTabBar } from '../../components/navigation/AdaptiveGlassTabBar';
import { Colors } from '../../constants/theme';

export default function TabLayout() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];

  return (
    <>
      <StatusBar
        barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'}
      />
      <Tabs
        tabBar={(props) => <AdaptiveGlassTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarHideOnKeyboard: true,
          sceneStyle: { backgroundColor: colors.background },
          tabBarStyle: {
            position: 'absolute',
            backgroundColor: 'transparent',
            borderTopWidth: 0,
            elevation: 0,
          },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home', tabBarAccessibilityLabel: 'Home' }} />
        <Tabs.Screen name="batches" options={{ title: 'Batches', tabBarAccessibilityLabel: 'Batches' }} />
        <Tabs.Screen name="quick-fee" options={{ href: null }} />
        <Tabs.Screen name="tests" options={{ title: 'Tests', tabBarAccessibilityLabel: 'Tests' }} />
        <Tabs.Screen name="quizzes" options={{ title: 'Quizzes', tabBarAccessibilityLabel: 'Quizzes' }} />
        <Tabs.Screen name="fees" options={{ title: 'Fees', tabBarAccessibilityLabel: 'Fees' }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
      </Tabs>
    </>
  );
}
