import {
  Alert,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Check, Crown, Minus, X } from "lucide-react-native";
import {
  BorderRadius,
  Colors,
  Shadows,
  Spacing,
  TypeScale,
} from "../../constants/theme";
import { PressableScale } from "../ui";
import { useAccessibilityPreferences } from "../ui/useAccessibilityPreferences";
import type { ProFeaturePrompt } from "../../services/proFeatureGate";

interface ProUpgradeSheetProps {
  prompt: ProFeaturePrompt | null;
  onClose: () => void;
}

const PLAN_COMPARISON = [
  { feature: "Batches, tests, manual marks, and fees", basic: true, pro: true },
  { feature: "Manual student addition", basic: true, pro: true },
  { feature: "Offline viewing and offline work", basic: true, pro: true },
  { feature: "Scan Marks and receipt OCR", basic: false, pro: true },
  { feature: "WhatsApp fee reminders", basic: false, pro: true },
  { feature: "WhatsApp student invitations", basic: false, pro: true },
  { feature: "WhatsApp batch group links", basic: false, pro: true },
  { feature: "AI quiz generation from documents", basic: false, pro: true },
  { feature: "Online quiz delivery", basic: false, pro: true },
  { feature: "Quiz credits and top-ups", basic: false, pro: true },
] as const;

export function ProUpgradeSheet({ prompt, onClose }: ProUpgradeSheetProps) {
  const colors = Colors[useColorScheme() === "dark" ? "dark" : "light"];
  const { reduceMotion, reduceTransparency } = useAccessibilityPreferences();

  const openUpgrade = async () => {
    onClose();
    try {
      await Linking.openURL("https://mathlogs.app/billing");
    } catch {
      Alert.alert(
        "Upgrade page unavailable",
        "Open MathLogs on the web and choose the Pro plan from Billing.",
      );
    }
  };

  return (
    <Modal
      accessibilityViewIsModal
      animationType={reduceMotion ? "none" : "slide"}
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      transparent
      visible={Boolean(prompt)}
    >
      <View
        style={[
          styles.backdrop,
          {
            backgroundColor: reduceTransparency
              ? colors.backgroundDeep
              : colors.overlay,
          },
        ]}
      >
        <PressableScale
          accessibilityLabel="Close Pro upgrade"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        >
          <View style={StyleSheet.absoluteFill} />
        </PressableScale>

        <SafeAreaView
          edges={["bottom"]}
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              shadowColor: colors.shadow,
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <View style={styles.header}>
            <View style={[styles.icon, { backgroundColor: colors.hero }]}>
              <Crown size={22} color={colors.heroText} />
            </View>
            <View style={styles.headingCopy}>
              <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>
                PRO FEATURE
              </Text>
              <Text
                accessibilityRole="header"
                style={[styles.title, { color: colors.text }]}
              >
                Available with Pro
              </Text>
            </View>
            <PressableScale
              accessibilityLabel="Close Pro upgrade"
              onPress={onClose}
              style={[
                styles.closeButton,
                { backgroundColor: colors.surfaceSecondary },
              ]}
            >
              <X size={20} color={colors.text} />
            </PressableScale>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            style={styles.scroll}
          >
            <Text style={[styles.feature, { color: colors.text }]}>
              {prompt?.feature}
            </Text>
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              {prompt?.description ||
                "Upgrade to Pro to use this online feature."}
            </Text>

            <View
              style={[
                styles.comparison,
                {
                  backgroundColor: colors.surfaceSecondary,
                  borderColor: colors.border,
                },
              ]}
            >
              <View
                style={[
                  styles.comparisonRow,
                  styles.comparisonHeader,
                  { borderBottomColor: colors.border },
                ]}
              >
                <Text
                  style={[
                    styles.comparisonFeatureHeader,
                    { color: colors.textSecondary },
                  ]}
                >
                  FEATURE
                </Text>
                <Text
                  style={[styles.planHeader, { color: colors.textSecondary }]}
                >
                  BASIC
                </Text>
                <Text style={[styles.planHeader, { color: colors.text }]}>
                  PRO
                </Text>
              </View>
              {PLAN_COMPARISON.map((item, index) => (
                <View
                  key={item.feature}
                  style={[
                    styles.comparisonRow,
                    index < PLAN_COMPARISON.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[styles.comparisonFeature, { color: colors.text }]}
                  >
                    {item.feature}
                  </Text>
                  <View style={styles.planValue}>
                    {item.basic ? (
                      <Check
                        size={17}
                        color={colors.positive}
                        strokeWidth={2.5}
                      />
                    ) : (
                      <Minus size={17} color={colors.textMuted} />
                    )}
                  </View>
                  <View style={styles.planValue}>
                    {item.pro ? (
                      <Check
                        size={17}
                        color={colors.positive}
                        strokeWidth={2.5}
                      />
                    ) : (
                      <Minus size={17} color={colors.textMuted} />
                    )}
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>

          <PressableScale
            accessibilityLabel="Upgrade to Pro"
            haptic="commit"
            onPress={() => void openUpgrade()}
            style={[
              styles.upgradeButton,
              { backgroundColor: colors.text },
              Shadows.md,
            ]}
          >
            <Crown size={19} color={colors.background} />
            <Text style={[styles.upgradeText, { color: colors.background }]}>
              Upgrade to Pro
            </Text>
          </PressableScale>

          <PressableScale
            accessibilityLabel="Not now"
            onPress={onClose}
            style={styles.notNowButton}
          >
            <Text style={[styles.notNowText, { color: colors.textSecondary }]}>
              Not now
            </Text>
          </PressableScale>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: BorderRadius["2xl"],
    borderTopRightRadius: BorderRadius["2xl"],
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: "92%",
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.sm,
    ...Shadows.lg,
  },
  handle: {
    width: 42,
    height: 5,
    borderRadius: BorderRadius.full,
    alignSelf: "center",
    marginTop: Spacing.sm,
  },
  header: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  icon: {
    width: 46,
    height: 46,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  headingCopy: { flex: 1, minWidth: 0 },
  eyebrow: { ...TypeScale.caption, letterSpacing: 1.1, marginBottom: 2 },
  title: { ...TypeScale.sectionTitle },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { flexShrink: 1 },
  scrollContent: { paddingBottom: Spacing.xs },
  feature: { ...TypeScale.sectionTitle, marginTop: Spacing.sm },
  description: { ...TypeScale.body, marginTop: Spacing.sm },
  comparison: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
    marginTop: Spacing.xl,
  },
  comparisonRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
  },
  comparisonHeader: {
    minHeight: 38,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  comparisonFeatureHeader: {
    ...TypeScale.caption,
    flex: 1,
    letterSpacing: 0.7,
  },
  planHeader: {
    ...TypeScale.caption,
    width: 54,
    textAlign: "center",
    letterSpacing: 0.7,
  },
  comparisonFeature: {
    ...TypeScale.caption,
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingRight: Spacing.sm,
  },
  planValue: { width: 54, alignItems: "center", justifyContent: "center" },
  upgradeButton: {
    minHeight: 52,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  upgradeText: { ...TypeScale.label },
  notNowButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.xs,
  },
  notNowText: { ...TypeScale.label },
});
