import { useRef, type ComponentType } from 'react';
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Archive,
  Download,
  IndianRupee,
  MonitorPlay,
  Pause,
  Play,
  Printer,
  QrCode,
  Send,
  Settings,
  X,
  type LucideProps,
} from 'lucide-react-native';
import { BorderRadius, Colors, FontSize, FontWeight, Spacing, TypeScale } from '../../constants/theme';
import { PressableScale, Surface } from '../ui';
import { useAccessibilityPreferences } from '../ui/useAccessibilityPreferences';

type ActionIcon = ComponentType<LucideProps>;

interface BatchActionsSheetProps {
  visible: boolean;
  batchName: string;
  isDownloading: boolean;
  isRegistrationOpen: boolean;
  isRegistrationEnded: boolean;
  showFeeSetup: boolean;
  feeSetupDescription?: string;
  onClose: () => void;
  onOpenQr: () => void;
  onDownloadRoster: () => void;
  onDownloadStickers: () => void;
  onInviteStudent: () => void;
  onToggleRegistration: () => void;
  onEndRegistration: () => void;
  onOpenSettings: () => void;
  onOpenKiosk: () => void;
  onOpenFeeSetup: () => void;
}

interface ActionTileProps {
  icon: ActionIcon;
  label: string;
  description: string;
  disabled?: boolean;
  singleColumn: boolean;
  onPress: () => void;
}

function ActionTile({ icon: Icon, label, description, disabled, singleColumn, onPress }: ActionTileProps) {
  const colors = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const { fontScale } = useWindowDimensions();

  return (
    <PressableScale
      accessibilityLabel={`${label}. ${description}`}
      disabled={disabled}
      onPress={onPress}
      style={[styles.tilePressable, singleColumn && styles.singleColumnTile, disabled && styles.disabled]}
    >
      <Surface style={[styles.tile, { height: Math.ceil(160 * Math.max(1, fontScale)) }, singleColumn && styles.singleColumnTileSurface]}>
        <View style={[styles.tileIcon, singleColumn && styles.singleColumnIcon, { backgroundColor: colors.surfaceSecondary }]}>
          <Icon size={21} color={colors.text} />
        </View>
        <View style={styles.tileCopy}>
          <Text style={[styles.tileLabel, { color: colors.text }]}>{label}</Text>
          <Text style={[styles.tileDescription, { color: colors.textSecondary }]}>{description}</Text>
        </View>
      </Surface>
    </PressableScale>
  );
}

export function BatchActionsSheet({
  visible,
  batchName,
  isDownloading,
  isRegistrationOpen,
  isRegistrationEnded,
  showFeeSetup,
  feeSetupDescription = 'Manage fee installments.',
  onClose,
  onOpenQr,
  onDownloadRoster,
  onDownloadStickers,
  onInviteStudent,
  onToggleRegistration,
  onEndRegistration,
  onOpenSettings,
  onOpenKiosk,
  onOpenFeeSetup,
}: BatchActionsSheetProps) {
  const colors = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const { width, fontScale } = useWindowDimensions();
  const { reduceMotion } = useAccessibilityPreferences();
  const pendingActionRef = useRef<(() => void) | null>(null);
  const singleColumn = width < 320 || fontScale > 1.2;

  const run = (action: () => void) => {
    if (Platform.OS === 'ios') {
      pendingActionRef.current = action;
      onClose();
      return;
    }
    onClose();
    action();
  };

  const handleDismiss = () => {
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    action?.();
  };

  return (
    <Modal
      accessibilityViewIsModal
      animationType={reduceMotion ? 'none' : 'slide'}
      onDismiss={handleDismiss}
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      transparent
      visible={visible}
    >
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <PressableScale
          accessibilityLabel="Close batch actions"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        >
          <View style={StyleSheet.absoluteFill} />
        </PressableScale>
        <SafeAreaView edges={['bottom']} style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Batch actions</Text>
              <Text numberOfLines={1} style={[styles.subtitle, { color: colors.textSecondary }]}>{batchName}</Text>
            </View>
            <PressableScale
              accessibilityLabel="Close batch actions"
              onPress={onClose}
              style={[styles.closeButton, { backgroundColor: colors.surfaceSecondary }]}
            >
              <X size={20} color={colors.text} />
            </PressableScale>
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.grid}>
              {!isRegistrationEnded ? (
                <ActionTile
                  description="Show or share the code."
                  icon={QrCode}
                  label="Registration QR"
                  onPress={() => run(onOpenQr)}
                  singleColumn={singleColumn}
                />
              ) : null}
              <ActionTile
                description={isDownloading ? 'Preparing the roster…' : 'Share the student list.'}
                disabled={isDownloading}
                icon={Download}
                label="Roster PDF"
                onPress={() => run(onDownloadRoster)}
                singleColumn={singleColumn}
              />
              <ActionTile
                description={isDownloading ? 'Preparing stickers…' : 'Print student labels.'}
                disabled={isDownloading}
                icon={Printer}
                label="Print stickers"
                onPress={() => run(onDownloadStickers)}
                singleColumn={singleColumn}
              />
              <ActionTile
                description="Send a WhatsApp link."
                icon={Send}
                label="Invite student"
                onPress={() => run(onInviteStudent)}
                singleColumn={singleColumn}
              />
              {!isRegistrationEnded ? (
                <ActionTile
                  description={isRegistrationOpen ? 'Stop new registrations.' : 'Allow new registrations.'}
                  icon={isRegistrationOpen ? Pause : Play}
                  label={isRegistrationOpen ? 'Pause registration' : 'Resume registration'}
                  onPress={() => run(onToggleRegistration)}
                  singleColumn={singleColumn}
                />
              ) : null}
              <ActionTile
                description="Edit batch details."
                icon={Settings}
                label="Batch settings"
                onPress={() => run(onOpenSettings)}
                singleColumn={singleColumn}
              />
              <ActionTile
                description="Open the registration form."
                icon={MonitorPlay}
                label="Registration kiosk"
                onPress={() => run(onOpenKiosk)}
                singleColumn={singleColumn}
              />
              {showFeeSetup ? (
                <ActionTile
                  description={feeSetupDescription}
                  icon={IndianRupee}
                  label="Fee setup"
                  onPress={() => run(onOpenFeeSetup)}
                  singleColumn={singleColumn}
                />
              ) : null}
            </View>

            {!isRegistrationEnded ? (
              <PressableScale
                accessibilityLabel="Close registration permanently"
                onPress={() => run(onEndRegistration)}
                style={[styles.dangerAction, { borderColor: Colors.errorBg, backgroundColor: Colors.errorBg }]}
              >
                <Archive size={20} color={Colors.error} />
                <View style={styles.dangerCopy}>
                  <Text style={[styles.dangerTitle, { color: Colors.error }]}>Close registration permanently</Text>
                  <Text style={[styles.dangerDescription, { color: colors.textSecondary }]}>Existing students remain in the batch.</Text>
                </View>
              </PressableScale>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: BorderRadius['2xl'],
    borderTopRightRadius: BorderRadius['2xl'],
    overflow: 'hidden',
  },
  handle: { width: 42, height: 5, borderRadius: 999, alignSelf: 'center', marginTop: Spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg },
  headerCopy: { flex: 1, paddingRight: Spacing.md },
  title: { ...TypeScale.sectionTitle },
  subtitle: { ...TypeScale.caption, marginTop: 2 },
  closeButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: Spacing.md },
  tilePressable: { width: '47.5%' },
  singleColumnTile: { width: '100%' },
  tile: { height: 160, padding: 12 },
  singleColumnTileSurface: { height: 'auto', minHeight: 88, flexDirection: 'row', alignItems: 'center' },
  tileIcon: { width: 42, height: 42, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm },
  singleColumnIcon: { marginBottom: 0, marginRight: Spacing.md },
  tileCopy: { flex: 1, minWidth: 0 },
  tileLabel: { fontSize: FontSize.base, lineHeight: 20, fontWeight: FontWeight.semibold },
  tileDescription: { fontSize: FontSize.sm, lineHeight: 18, fontWeight: FontWeight.regular, marginTop: 3, flexShrink: 1 },
  disabled: { opacity: 0.5 },
  dangerAction: {
    minHeight: 64,
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  dangerCopy: { flex: 1 },
  dangerTitle: { ...TypeScale.label },
  dangerDescription: { ...TypeScale.caption, marginTop: 2 },
});
