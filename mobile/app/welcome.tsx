import React, { useRef, useState } from 'react';
import {
  FlatList, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  ArrowRight, Check, ClipboardCheck, IndianRupee, Layers3, Sparkles, Users, WifiOff,
  type LucideIcon,
} from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { BorderRadius, Colors, FontSize, FontWeight, Spacing, TouchTarget, TypeScale } from '../constants/theme';

const colors = Colors.light;

type Slide = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  points: Array<{ icon: LucideIcon; label: string }>;
};

const slides: Slide[] = [
  {
    id: 'workspace',
    eyebrow: 'BUILT FOR TEACHERS',
    title: 'Run your teaching day from one place.',
    description: 'Keep batches, students, tests, marks and fees organised without jumping between notebooks and spreadsheets.',
    icon: Layers3,
    points: [
      { icon: Users, label: 'Students and batches' },
      { icon: ClipboardCheck, label: 'Tests and marks' },
      { icon: IndianRupee, label: 'Fees and payment records' },
    ],
  },
  {
    id: 'basic',
    eyebrow: 'BASIC PLAN',
    title: 'Your core workspace works offline.',
    description: 'Load your data once, then continue the everyday work that does not need an online service. Changes sync when your connection returns.',
    icon: WifiOff,
    points: [
      { icon: Check, label: 'Offline viewing and supported offline updates' },
      { icon: Check, label: 'Manual student addition' },
      { icon: Check, label: 'No quiz credits required' },
    ],
  },
  {
    id: 'pro',
    eyebrow: 'PRO WHEN YOU NEED IT',
    title: 'Add connected tools without changing your workflow.',
    description: 'Pro adds online and AI services on top of Basic. The app will explain the upgrade before you use a Pro-only action.',
    icon: Sparkles,
    points: [
      { icon: Check, label: 'Scan marks and AI quiz generation' },
      { icon: Check, label: 'WhatsApp invites and reminders' },
      { icon: Check, label: 'Online quizzes and quiz credits' },
    ],
  },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const { completeOnboarding } = useAuth();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);
  const lastSlide = index === slides.length - 1;

  const finish = async (destination: '/login' | '/signup') => {
    await completeOnboarding();
    router.replace(destination);
  };

  const next = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    listRef.current?.scrollToIndex({ index: Math.min(index + 1, slides.length - 1), animated: true });
  };

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / Math.max(width, 1));
    setIndex(Math.max(0, Math.min(slides.length - 1, nextIndex)));
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.brand}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>M</Text></View>
          <Text style={styles.brandName}>MathLogs</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => void finish('/login')} hitSlop={8} style={styles.signInTop}>
          <Text style={styles.signInTopText}>Sign in</Text>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={slides}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        onMomentumScrollEnd={onScrollEnd}
        renderItem={({ item }) => <WelcomeSlide slide={item} width={width} />}
      />

      <View style={styles.footer}>
        <View accessibilityLabel={`Page ${index + 1} of ${slides.length}`} style={styles.dots}>
          {slides.map((slide, dotIndex) => <View key={slide.id} style={[styles.dot, dotIndex === index && styles.dotActive]} />)}
        </View>

        {lastSlide ? (
          <View style={styles.finalActions}>
            <Pressable accessibilityRole="button" onPress={() => void finish('/signup')} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
              <Text style={styles.primaryButtonText}>Create Basic account</Text>
              <ArrowRight size={19} color={colors.heroText} />
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => void finish('/login')} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
              <Text style={styles.secondaryButtonText}>I already have an account</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel="Show next introduction page" onPress={next} style={({ pressed }) => [styles.nextButton, pressed && styles.pressed]}>
            <Text style={styles.nextButtonText}>Next</Text>
            <ArrowRight size={19} color={colors.heroText} />
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

function WelcomeSlide({ slide, width }: { slide: Slide; width: number }) {
  const Icon = slide.icon;
  return (
    <ScrollView
      style={{ width }}
      contentContainerStyle={styles.slide}
      showsVerticalScrollIndicator={false}
      bounces={false}
    >
      <View style={styles.heroCard}>
        <View style={styles.heroIcon}><Icon size={34} color={colors.heroText} strokeWidth={1.8} /></View>
        <View style={styles.heroDecorationOne} />
        <View style={styles.heroDecorationTwo} />
      </View>

      <View style={styles.copy}>
        <Text style={styles.eyebrow}>{slide.eyebrow}</Text>
        <Text accessibilityRole="header" style={styles.title}>{slide.title}</Text>
        <Text style={styles.description}>{slide.description}</Text>
      </View>

      <View style={styles.pointList}>
        {slide.points.map((point) => {
          const PointIcon = point.icon;
          return (
            <View key={point.label} style={styles.pointRow}>
              <View style={styles.pointIcon}><PointIcon size={17} color={colors.text} strokeWidth={2.2} /></View>
              <Text style={styles.pointLabel}>{point.label}</Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  header: { minHeight: 64, paddingHorizontal: Spacing.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  brandMark: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.hero, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: colors.heroText, fontSize: FontSize.md, fontWeight: FontWeight.black },
  brandName: { color: colors.text, fontSize: FontSize.md, fontWeight: FontWeight.bold, letterSpacing: -0.3 },
  signInTop: { minHeight: TouchTarget.minimum, justifyContent: 'center', paddingHorizontal: Spacing.sm },
  signInTopText: { ...TypeScale.label, color: colors.text },
  slide: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, paddingBottom: Spacing.xl, gap: Spacing['2xl'] },
  heroCard: { height: 190, borderRadius: BorderRadius['2xl'], backgroundColor: colors.hero, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  heroIcon: { width: 76, height: 76, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  heroDecorationOne: { position: 'absolute', width: 210, height: 210, borderRadius: 105, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', top: -100, right: -60 },
  heroDecorationTwo: { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.04)', bottom: -65, left: -25 },
  copy: { gap: Spacing.sm },
  eyebrow: { ...TypeScale.caption, color: colors.textSecondary, letterSpacing: 1.4, fontWeight: FontWeight.bold },
  title: { fontSize: FontSize['3xl'], lineHeight: 40, letterSpacing: -1.1, fontWeight: FontWeight.bold, color: colors.text },
  description: { ...TypeScale.body, color: colors.textSecondary },
  pointList: { gap: Spacing.sm },
  pointRow: { minHeight: 48, borderRadius: BorderRadius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, paddingHorizontal: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  pointIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  pointLabel: { ...TypeScale.label, flex: 1, color: colors.text },
  footer: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, paddingBottom: Spacing.lg, gap: Spacing.lg },
  dots: { height: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.chartSoft },
  dotActive: { width: 28, backgroundColor: colors.chart },
  nextButton: { minHeight: 54, borderRadius: BorderRadius.lg, backgroundColor: colors.hero, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  nextButtonText: { ...TypeScale.label, fontSize: FontSize.base, color: colors.heroText },
  finalActions: { gap: Spacing.sm },
  primaryButton: { minHeight: 54, borderRadius: BorderRadius.lg, backgroundColor: colors.hero, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  primaryButtonText: { ...TypeScale.label, fontSize: FontSize.base, color: colors.heroText },
  secondaryButton: { minHeight: 50, borderRadius: BorderRadius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { ...TypeScale.label, color: colors.text },
  pressed: { opacity: 0.72 },
});
