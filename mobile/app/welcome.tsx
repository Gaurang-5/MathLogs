import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, FlatList, ViewToken, Platform, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, withRepeat, withTiming, useSharedValue, useAnimatedStyle, Easing, Extrapolation, interpolate } from 'react-native-reanimated';
import { ArrowRight, Sparkles, Scan, LayoutDashboard } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import * as Haptics from 'expo-haptics';

const { width, height } = Dimensions.get('window');

const T = {
  bg: '#FDFDFD',
  black: '#000000',
  white: '#FFFFFF',
  text: '#171717',
  textMuted: '#9CA3AF',
  border: '#E5E7EB',
  emerald: '#10b981',
};

const AnimatedBackground = () => {
  const rotation1 = useSharedValue(0);
  const rotation2 = useSharedValue(0);
  const translateY = useSharedValue(-height * 0.1);
  const translateX = useSharedValue(-width * 0.1);

  useEffect(() => {
    rotation1.value = withRepeat(withTiming(360, { duration: 60000, easing: Easing.linear }), -1);
    rotation2.value = withRepeat(withTiming(-360, { duration: 80000, easing: Easing.linear }), -1);
    translateY.value = withRepeat(withTiming(height * 1.1, { duration: 8000, easing: Easing.linear }), -1);
    translateX.value = withRepeat(withTiming(width * 1.1, { duration: 12000, easing: Easing.linear }), -1);
  }, []);

  const shape1Style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation1.value}deg` }] }));
  const shape2Style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation2.value}deg` }] }));
  const scanHStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const scanVStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Horizontal Scanning Line */}
      <Animated.View style={[{ position: 'absolute', left: 0, width: '100%', height: 1, backgroundColor: 'rgba(0,0,0,0.1)' }, scanHStyle]} />
      
      {/* Vertical Scanning Line */}
      <Animated.View style={[{ position: 'absolute', top: 0, height: '100%', width: 1, backgroundColor: 'rgba(0,0,0,0.05)' }, scanVStyle]} />

      {/* Accent Shapes */}
      <Animated.View style={[s.bgShape1, shape1Style]} />
      <Animated.View style={[s.bgShape2, shape2Style]} />
    </View>
  );
};

const slides = [
  {
    id: '1',
    title: 'Administration\nGateway.',
    subtitle: 'Centralized management for batches, students, and secure records. Automate your workflow seamlessly.',
    image: require('../assets/images/slide_admin.png')
  },
  {
    id: '2',
    title: 'Instant AI\nTests.',
    subtitle: 'Generate anti-cheat variations and high-quality assessments in seconds using state-of-the-art AI.',
    image: require('../assets/images/slide_ai_tests.png')
  },
  {
    id: '3',
    title: 'Smart\nScanner.',
    subtitle: 'Scan and grade physical test papers instantly using edge detection and computer vision.',
    image: require('../assets/images/slide_smart_scanner.png')
  }
];

export default function WelcomeScreen() {
  const { completeOnboarding } = useAuth();
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollX = useSharedValue(0);

  const viewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems[0]) {
      setCurrentIndex(viewableItems[0].index || 0);
    }
  }).current;

  const viewConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;
  const flatListRef = useRef<FlatList>(null);

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
    } else {
      completeOnboarding();
    }
  };

  const renderItem = ({ item, index }: { item: typeof slides[0], index: number }) => {
    return (
      <View style={{ width, flex: 1, paddingHorizontal: 32, justifyContent: 'center' }}>
        <Animated.View entering={FadeInDown.duration(800).delay(100)}>
          <View style={s.imageContainer}>
            <Image source={item.image} style={s.slideImage} resizeMode="cover" />
          </View>
          <Text style={s.title}>{item.title}</Text>
          <Text style={s.subtitle}>{item.subtitle}</Text>
        </Animated.View>
      </View>
    );
  };

  return (
    <View style={s.container}>
      <AnimatedBackground />
      <SafeAreaView style={s.safeArea}>
        
        <Animated.FlatList
          ref={flatListRef as any}
          data={slides}
          renderItem={renderItem}
          horizontal
          showsHorizontalScrollIndicator={false}
          pagingEnabled
          bounces={false}
          keyExtractor={(item) => item.id}
          onScroll={(e) => {
            scrollX.value = e.nativeEvent.contentOffset.x;
          }}
          onViewableItemsChanged={viewableItemsChanged}
          viewabilityConfig={viewConfig}
          scrollEventThrottle={16}
        />

        <View style={s.bottomContainer}>
          <View style={s.pagination}>
            {slides.map((_, i) => {
              const dotStyle = useAnimatedStyle(() => {
                const opacity = interpolate(
                  scrollX.value,
                  [(i - 1) * width, i * width, (i + 1) * width],
                  [0.3, 1, 0.3],
                  Extrapolation.CLAMP
                );
                const widthValue = interpolate(
                  scrollX.value,
                  [(i - 1) * width, i * width, (i + 1) * width],
                  [8, 24, 8],
                  Extrapolation.CLAMP
                );
                return { opacity, width: widthValue };
              });
              return <Animated.View key={i} style={[s.dot, dotStyle]} />;
            })}
          </View>

          <TouchableOpacity style={s.nextBtn} onPress={handleNext}>
            <Text style={s.nextBtnText}>
              {currentIndex === slides.length - 1 ? 'Get Started' : 'Next'}
            </Text>
            <ArrowRight size={20} color={T.white} />
          </TouchableOpacity>
        </View>

      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  safeArea: { flex: 1 },
  bgShape1: {
    position: 'absolute', width: width * 1.5, height: width * 1.5,
    borderRadius: 80, backgroundColor: 'rgba(0,0,0,0.02)',
    top: -width * 0.5, left: -width * 0.5,
  },
  bgShape2: {
    position: 'absolute', width: width, height: width,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
    bottom: -width * 0.2, right: -width * 0.2,
  },
  imageContainer: {
    width: '100%', height: height * 0.35, borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.03)',
    marginBottom: 32, borderWidth: 1, borderColor: T.border,
    overflow: 'hidden'
  },
  slideImage: {
    width: '100%', height: '100%'
  },
  title: {
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif',
    fontSize: 48, fontWeight: '800', color: T.text,
    letterSpacing: -1.5, lineHeight: 52, marginBottom: 16
  },
  subtitle: {
    fontSize: 16, color: T.textMuted, lineHeight: 24,
    maxWidth: '90%'
  },
  bottomContainer: {
    paddingHorizontal: 32,
    paddingBottom: Platform.OS === 'ios' ? 16 : 32,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    height: 100
  },
  pagination: {
    flexDirection: 'row', alignItems: 'center', gap: 6
  },
  dot: {
    height: 8, borderRadius: 4, backgroundColor: T.text
  },
  nextBtn: {
    backgroundColor: T.black, paddingHorizontal: 24, paddingVertical: 16,
    borderRadius: 99, flexDirection: 'row', alignItems: 'center', gap: 8
  },
  nextBtnText: {
    color: T.white, fontSize: 16, fontWeight: '600'
  }
});
