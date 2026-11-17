import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  Feedback,
  PressableScale,
  SkeletonLoader,
  Surface,
  TEACHER_TAB_CONTENT_INSET,
  TeacherSearchSheet,
} from '../../components/ui';
import { useAccessibilityPreferences } from '../../components/ui/useAccessibilityPreferences';
import {
  Brain,
  Calendar,
  ChevronRight,
  Clock3,
  Search,
  ShoppingCart,
  Sparkles,
  Timer,
  X,
} from 'lucide-react-native';
import {
  BorderRadius,
  Colors,
  FontWeight,
  Shadows,
  Spacing,
  TypeScale,
} from '../../constants/theme';
import api from '../../services/api';
import { offlineQuery } from '../../services/offlineSync';
import { useAuth } from '../../contexts/AuthContext';

interface OnlineQuiz {
  id: string;
  title: string;
  topic?: string | null;
  difficulty?: string | null;
  timeLimitMins: number;
  totalMarks: number;
  availableFrom?: string | null;
  availableUntil?: string | null;
  isFinalized: boolean;
  createdAt: string;
  batchId?: string | null;
  studentQuestionCount?: number | null;
  batch?: {
    id?: string;
    name: string;
    className?: string | null;
  };
  _count: { submissions: number };
}

interface StatusColors {
  textSecondary: string;
  attention: string;
  positive: string;
}

type ThemeColors = typeof Colors.light | typeof Colors.dark;

function getQuizStatus(quiz: OnlineQuiz, colors: StatusColors): { color: string; label: string } {
  if (quiz.isFinalized) return { color: colors.textSecondary, label: 'Finalized' };

  if (quiz.availableFrom) {
    const quizDate = new Date(quiz.availableFrom);
    const now = new Date();
    if (quizDate > now) return { color: colors.attention, label: 'Upcoming' };
  }

  return { color: colors.positive, label: 'Published' };
}

function QuizCard({
  item,
  index,
  onPress,
  colors,
  reduceMotion,
}: {
  item: OnlineQuiz;
  index: number;
  onPress: () => void;
  colors: ThemeColors;
  reduceMotion: boolean;
}) {
  const status = getQuizStatus(item, colors);
  const dateStr = item.availableFrom
    ? new Date(item.availableFrom).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Instant';

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInDown.duration(260).delay(Math.min(index, 4) * 35)}
      style={styles.cardSpacing}
    >
      <Surface
        onPress={onPress}
        accessibilityLabel={`Open quiz ${item.title}`}
        style={styles.quizCard}
      >
        <View style={[styles.quizIcon, { backgroundColor: `${status.color}18` }]}>
          <Brain size={22} color={status.color} strokeWidth={2} />
        </View>

        <View style={styles.quizCopy}>
          <View style={styles.cardTitleRow}>
            <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
            <View style={[styles.statusPill, { backgroundColor: `${status.color}18` }]}>
              <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
            </View>
          </View>

          <View style={styles.metaRow}>
            <Calendar size={14} color={colors.textSecondary} />
            <Text style={[styles.metaText, { color: colors.textSecondary }]}>{dateStr}</Text>
            {item.timeLimitMins > 0 ? (
              <>
                <View style={[styles.metaDivider, { backgroundColor: colors.border }]} />
                <Timer size={14} color={colors.textSecondary} />
                <Text style={[styles.metaText, { color: colors.textSecondary }]}>{item.timeLimitMins} min</Text>
              </>
            ) : null}
          </View>

          <Text style={[styles.detailText, { color: colors.textMuted }]} numberOfLines={2}>
            {item.batch?.name || 'General'}{item.topic ? ` · ${item.topic}` : ''} · {item.totalMarks} marks
          </Text>
        </View>

        <ChevronRight size={20} color={colors.textMuted} />
      </Surface>
    </Animated.View>
  );
}

export default function QuizzesScreen() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  const { reduceMotion, reduceTransparency } = useAccessibilityPreferences();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const isBasicPlan = user?.productPlan === 'BASIC';
  const [search, setSearch] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showBuyModal, setShowBuyModal] = useState(false);

  const {
    data: quizzes,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery<OnlineQuiz[]>({
    queryKey: ['quizzes'],
    queryFn: () => offlineQuery('online-quizzes', async () => (await api.get('/tests/online')).data),
    enabled: !isBasicPlan,
  });

  const { data: institute, refetch: refetchInstitute } = useQuery<{ quizCredits?: number }>({
    queryKey: ['institute-me'],
    queryFn: () => offlineQuery('institute', async () => (await api.get('/institute/me')).data),
    enabled: !isBasicPlan,
  });

  const filtered = useMemo(() => {
    if (!quizzes) return [];
    if (!search) return quizzes;
    const query = search.toLowerCase();
    return quizzes.filter(quiz =>
      quiz.title.toLowerCase().includes(query) ||
      (quiz.topic && quiz.topic.toLowerCase().includes(query))
    );
  }, [quizzes, search]);

  const activeCount = useMemo(
    () => (quizzes || []).filter(quiz => !quiz.isFinalized).length,
    [quizzes],
  );
  const finalizedCount = useMemo(
    () => (quizzes || []).filter(quiz => quiz.isFinalized).length,
    [quizzes],
  );

  const handleOpenBilling = () => {
    setShowBuyModal(false);
    const webUrl = api.defaults.baseURL
      ? api.defaults.baseURL.replace(/\/api\/?$/, '/billing')
      : 'https://mathlogs.in/billing';
    Linking.openURL(webUrl).catch(() => {
      void Linking.openURL('https://mathlogs.in/billing');
    });
  };

  const handleRefresh = () => {
    void refetch();
    void refetchInstitute();
  };

  const renderEmptyState = () => {
    if (isLoading) {
      return (
        <View style={styles.skeletonStack}>
          {[1, 2, 3].map(item => (
            reduceMotion ? (
              <View
                key={item}
                style={[
                  styles.staticSkeleton,
                  {
                    width: Math.max(width - Spacing['4xl'], 0),
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.border,
                  },
                ]}
              />
            ) : (
              <SkeletonLoader
                key={item}
                width={Math.max(width - Spacing['4xl'], 0)}
                height={126}
                borderRadius={BorderRadius.xl}
              />
            )
          ))}
        </View>
      );
    }

    if (isError) {
      return (
        <Feedback
          kind="error"
          title="Quizzes could not be loaded"
          description="Check your connection and try again."
          action={(
            <PressableScale
              accessibilityLabel="Retry loading quizzes"
              onPress={() => void refetch()}
              style={[styles.feedbackAction, { backgroundColor: colors.text }]}
            >
              <Text style={[styles.feedbackActionText, { color: colors.background }]}>Try again</Text>
            </PressableScale>
          )}
        />
      );
    }

    return (
      <Feedback
        kind="empty"
        title={search ? 'No matching quizzes' : 'No quizzes yet'}
        description={search ? 'Try another title or topic.' : 'Generate your first AI quiz when you are ready.'}
      />
    );
  };

  const header = (
    <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(280)}>
      <View style={styles.pageHeader}>
        <Text accessibilityRole="header" style={[styles.pageTitle, { color: colors.text }]}>Quizzes</Text>
        <View style={styles.headerActions}>
          <PressableScale
            accessibilityLabel="Search quizzes"
            onPress={() => setIsSearchOpen(true)}
            style={[styles.headerSearchAction, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
          >
            <Search size={19} color={colors.text} />
          </PressableScale>
          <PressableScale
            accessibilityLabel="Generate quiz"
            haptic="selection"
            onPress={() => router.push('/quiz-generator' as any)}
            style={[styles.primaryAction, { backgroundColor: colors.text }]}
          >
            <Sparkles size={18} color={colors.background} />
            <Text style={[styles.primaryActionText, { color: colors.background }]}>Generate</Text>
          </PressableScale>
        </View>
      </View>

      <Surface tone="strong" style={[styles.creditsHero, { backgroundColor: colors.hero, borderColor: colors.borderLight }]}>
        <View style={[styles.creditsIcon, { backgroundColor: colors.heroEnd }]}>
          <Sparkles size={22} color={colors.heroText} />
        </View>
        <View style={styles.creditsCopy}>
          <View style={styles.creditsValueRow}>
            <Text style={[styles.creditsValue, { color: colors.heroText }]}>{institute?.quizCredits ?? 0}</Text>
            <Text style={[styles.creditsTitle, { color: colors.heroText }]}>quiz credits</Text>
          </View>
          <Text style={[styles.creditsDescription, { color: colors.heroText }]}>One credit creates one AI quiz.</Text>
        </View>
        <PressableScale
          accessibilityLabel="Buy quiz credits"
          haptic="commit"
          onPress={() => setShowBuyModal(true)}
          style={[styles.buyButton, { backgroundColor: colors.heroText }]}
        >
          <ShoppingCart size={16} color={colors.hero} />
          <Text style={[styles.buyButtonText, { color: colors.hero }]}>Buy more</Text>
        </PressableScale>
      </Surface>

      {!isLoading ? (
        <View style={styles.statsRow}>
          <Surface style={styles.statCard}>
            <Sparkles size={19} color={colors.positive} />
            <View>
              <Text style={[styles.statValue, { color: colors.text }]}>{activeCount}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Active</Text>
            </View>
          </Surface>
          <Surface style={styles.statCard}>
            <Clock3 size={19} color={colors.textSecondary} />
            <View>
              <Text style={[styles.statValue, { color: colors.text }]}>{finalizedCount}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Finalized</Text>
            </View>
          </Surface>
        </View>
      ) : null}
    </Animated.View>
  );

  const creditPacks = [
    { credits: 5, price: '₹250', tagline: '₹50 / credit' },
    { credits: 10, price: '₹500', tagline: '₹50 / credit' },
    { credits: 25, price: '₹1,000', tagline: '₹40 / credit', popular: true },
    { credits: 40, price: '₹1,500', tagline: '₹37.5 / credit' },
  ];

  if (isBasicPlan) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.basicContent}
        >
          <Text accessibilityRole="header" style={[styles.pageTitle, { color: colors.text }]}>Quizzes</Text>
          <Surface tone="strong" style={[styles.basicPlanCard, { backgroundColor: colors.hero, borderColor: colors.borderLight }]}>
            <View style={[styles.creditsIcon, { backgroundColor: colors.heroEnd }]}>
              <Sparkles size={22} color={colors.heroText} />
            </View>
            <View style={styles.basicPlanCopy}>
              <Text style={[styles.basicPlanTitle, { color: colors.heroText }]}>Available with Pro</Text>
              <Text style={[styles.basicPlanDescription, { color: colors.heroText }]}>Basic includes batches, tests, marks, and fees with offline support. Pro adds AI quiz generation, online delivery, and quiz credits.</Text>
            </View>
          </Surface>
          <Feedback
            kind="empty"
            title="Your core workspace remains available"
            description="Use Tests for offline-capable assessments. Pro pricing and upgrades will appear here after the plan details are finalized."
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <FlatList
        data={filtered}
        renderItem={({ item, index }) => (
          <QuizCard
            item={item}
            index={index}
            colors={colors}
            reduceMotion={reduceMotion}
            onPress={() => router.push((`/quiz/${item.id}`) as any)}
          />
        )}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={(
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={handleRefresh}
            tintColor={colors.focus}
            colors={[colors.focus]}
          />
        )}
        ListHeaderComponent={header}
        ListHeaderComponentStyle={styles.listHeader}
        ListEmptyComponent={renderEmptyState}
      />

      <TeacherSearchSheet
        visible={isSearchOpen}
        title="Search quizzes"
        placeholder="Search by quiz or topic"
        value={search}
        onChangeText={setSearch}
        onClose={() => {
          setIsSearchOpen(false);
          setSearch('');
        }}
      >
        <View>
          {filtered.length === 0 ? (
            <Feedback kind="empty" title="No matching quizzes" description="Try another quiz title or topic." />
          ) : filtered.map((item, index) => (
            <QuizCard
              key={item.id}
              item={item}
              index={index}
              colors={colors}
              reduceMotion={reduceMotion}
              onPress={() => {
                setIsSearchOpen(false);
                setSearch('');
                router.push((`/quiz/${item.id}`) as any);
              }}
            />
          ))}
        </View>
      </TeacherSearchSheet>

      <Modal
        visible={showBuyModal}
        transparent
        animationType={reduceMotion ? 'none' : 'slide'}
        onRequestClose={() => setShowBuyModal(false)}
      >
        <View
          style={[
            styles.modalOverlay,
            { backgroundColor: reduceTransparency ? colors.backgroundDeep : colors.overlay },
          ]}
        >
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                paddingBottom: Math.max(insets.bottom, Spacing['2xl']),
              },
            ]}
          >
            <View style={styles.sheetHandleRow}>
              <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            </View>
            <View style={styles.modalHeader}>
              <View style={[styles.modalIcon, { backgroundColor: colors.surfaceSecondary }]}>
                <Sparkles size={21} color={colors.focus} />
              </View>
              <View style={styles.modalHeadingCopy}>
                <Text accessibilityRole="header" style={[styles.modalTitle, { color: colors.text }]}>Purchase quiz credits</Text>
                <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>One credit creates one AI quiz.</Text>
              </View>
              <PressableScale
                accessibilityLabel="Close purchase quiz credits"
                onPress={() => setShowBuyModal(false)}
                style={[styles.closeButton, { backgroundColor: colors.surfaceSecondary }]}
              >
                <X size={20} color={colors.textSecondary} />
              </PressableScale>
            </View>

            <View style={styles.packsGrid}>
              {creditPacks.map(pack => (
                <PressableScale
                  key={pack.credits}
                  accessibilityLabel={`Buy ${pack.credits} quiz credits for ${pack.price}`}
                  haptic="selection"
                  onPress={handleOpenBilling}
                  style={[
                    styles.packCard,
                    {
                      backgroundColor: pack.popular ? colors.surfaceSecondary : colors.background,
                      borderColor: pack.popular ? colors.focus : colors.border,
                    },
                  ]}
                >
                  {pack.popular ? (
                    <View style={[styles.popularBadge, { backgroundColor: colors.focus }]}>
                      <Text style={[styles.popularBadgeText, { color: colors.background }]}>Most popular</Text>
                    </View>
                  ) : null}
                  <Text style={[styles.packCredits, { color: colors.text }]}>{pack.credits} credits</Text>
                  <Text style={[styles.packPrice, { color: colors.focus }]}>{pack.price}</Text>
                  <Text style={[styles.packTagline, { color: colors.textSecondary }]}>{pack.tagline}</Text>
                </PressableScale>
              ))}
            </View>

            <PressableScale
              accessibilityLabel="Proceed to secure payment"
              haptic="commit"
              onPress={handleOpenBilling}
              style={[styles.proceedButton, { backgroundColor: colors.text }, Shadows.md]}
            >
              <ShoppingCart size={18} color={colors.background} />
              <Text style={[styles.proceedButtonText, { color: colors.background }]}>Proceed to secure payment</Text>
            </PressableScale>

            <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>
              Credits never expire and roll over automatically.
            </Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: TEACHER_TAB_CONTENT_INSET,
  },
  listHeader: { marginBottom: Spacing.xl },
  basicContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: TEACHER_TAB_CONTENT_INSET,
    gap: Spacing.xl,
  },
  basicPlanCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.lg,
    padding: Spacing.xl,
  },
  basicPlanCopy: { flex: 1, minWidth: 0 },
  basicPlanTitle: { ...TypeScale.sectionTitle, marginBottom: Spacing.sm },
  basicPlanDescription: { ...TypeScale.body, opacity: 0.82 },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerSearchAction: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: BorderRadius.full },
  pageTitle: TypeScale.pageTitle,
  primaryAction: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.full,
  },
  primaryActionText: { ...TypeScale.label, fontWeight: FontWeight.bold },
  creditsHero: {
    minHeight: 100,
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius['2xl'],
    marginBottom: Spacing.lg,
  },
  creditsIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  creditsCopy: { flex: 1, minWidth: 0, marginRight: Spacing.sm },
  creditsValueRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: Spacing.sm },
  creditsValue: { fontSize: 28, lineHeight: 34, fontWeight: FontWeight.bold },
  creditsTitle: { ...TypeScale.label },
  creditsDescription: { fontSize: 13, lineHeight: 18, marginTop: 2, opacity: 0.82 },
  buyButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  buyButtonText: { ...TypeScale.caption, fontWeight: FontWeight.bold },
  statsRow: { flexDirection: 'row', gap: Spacing.sm },
  statCard: {
    flex: 1,
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
  },
  statValue: { fontSize: 23, lineHeight: 28, fontWeight: FontWeight.bold },
  statLabel: TypeScale.caption,
  cardSpacing: { marginBottom: Spacing.md },
  quizCard: {
    minHeight: 118,
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.xl,
  },
  quizIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  quizCopy: { flex: 1, minWidth: 0, marginRight: Spacing.sm },
  cardTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  cardTitle: { flex: 1, fontSize: 17, lineHeight: 22, fontWeight: FontWeight.semibold },
  statusPill: { borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 4 },
  statusText: { ...TypeScale.caption, fontWeight: FontWeight.bold },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.sm },
  metaText: { fontSize: 13, lineHeight: 18, fontWeight: FontWeight.medium },
  metaDivider: { width: 1, height: 13, marginHorizontal: Spacing.xs },
  detailText: { fontSize: 13, lineHeight: 18, marginTop: Spacing.xs },
  skeletonStack: { gap: Spacing.md },
  staticSkeleton: { height: 126, borderRadius: BorderRadius.xl, borderWidth: 1 },
  feedbackAction: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.full,
  },
  feedbackActionText: TypeScale.label,
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: {
    borderTopLeftRadius: BorderRadius['2xl'],
    borderTopRightRadius: BorderRadius['2xl'],
    borderWidth: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
  },
  sheetHandleRow: { alignItems: 'center', paddingVertical: Spacing.sm },
  sheetHandle: { width: 42, height: 5, borderRadius: BorderRadius.full },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  modalIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeadingCopy: { flex: 1, minWidth: 0 },
  modalTitle: TypeScale.sectionTitle,
  modalSubtitle: { ...TypeScale.caption, marginTop: 2 },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  packsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginBottom: Spacing.xl },
  packCard: {
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 112,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  popularBadge: {
    alignSelf: 'flex-start',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    marginBottom: Spacing.sm,
  },
  popularBadgeText: { fontSize: 10, lineHeight: 14, fontWeight: FontWeight.bold },
  packCredits: { fontSize: 16, lineHeight: 22, fontWeight: FontWeight.bold },
  packPrice: { fontSize: 22, lineHeight: 28, fontWeight: FontWeight.bold, marginTop: 2 },
  packTagline: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  proceedButton: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    borderRadius: BorderRadius.lg,
  },
  proceedButtonText: { fontSize: 15, lineHeight: 21, fontWeight: FontWeight.bold },
  disclaimer: { ...TypeScale.caption, textAlign: 'center', marginTop: Spacing.md },
});
