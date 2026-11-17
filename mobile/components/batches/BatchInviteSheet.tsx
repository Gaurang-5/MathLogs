import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View, useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, CheckCircle2, ChevronLeft, Send, X } from 'lucide-react-native';
import { isAxiosError } from 'axios';
import { PressableScale } from '../ui';
import { useAccessibilityPreferences } from '../ui/useAccessibilityPreferences';
import { Colors, TypeScale } from '../../constants/theme';
import api from '../../services/api';
import {
  buildBatchInvitePayload, getBatchMonthBounds, initialBatchFeeMonth,
  type BatchInviteData,
} from '../../utils/batchInsights';

interface Props {
  visible: boolean;
  batch: BatchInviteData;
  onClose: () => void;
  onSuccess?: () => void;
}
type Decision = '' | 'SELECTED' | 'NO_FEE' | 'LATER';
type Payload = ReturnType<typeof buildBatchInvitePayload>;

function invitationError(error: unknown): string {
  if (!isAxiosError(error)) return error instanceof Error ? error.message : 'The invitation could not be sent.';
  const serverMessage = error.response?.data?.error;
  const messages: Record<string, string> = {
    FEE_MODE_MISMATCH: 'The institute fee mode changed. Close this sheet and refresh the batch.',
    BATCH_DATES_REQUIRED: 'Set the batch start and end dates before inviting students.',
    INVALID_FEE_START_MONTH: 'The fee start month must be within this batch’s dates.',
    INVALID_INSTALLMENT_SELECTION: 'The fee plan changed. Close this sheet, refresh, and review the fees again.',
  };
  if (typeof serverMessage === 'string') return messages[serverMessage] || serverMessage;
  if (!error.response) return 'Could not confirm whether the invitation was queued. Check your connection before trying again.';
  if (error.response.status === 401 || error.response.status === 403) return 'Your account could not send this invitation. Sign in again or check account access.';
  return 'The invitation could not be queued. Please try again.';
}

export default function BatchInviteSheet({ visible, batch, onClose, onSuccess }: Props) {
  const colors = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const { reduceMotion } = useAccessibilityPreferences();
  const [phone, setPhone] = useState('');
  const [decision, setDecision] = useState<Decision>('');
  const [selected, setSelected] = useState<string[]>([]);
  const [applyFuture, setApplyFuture] = useState(false);
  const [feeMonth, setFeeMonth] = useState('');
  const [review, setReview] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const submitting = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current += 1; }; }, []);
  useEffect(() => {
    generation.current += 1;
    if (visible) {
      setPhone(''); setDecision(''); setSelected([]); setApplyFuture(false);
      setFeeMonth(initialBatchFeeMonth(batch)); setReview(null); setError(''); setSuccess(false);
      setBusy(false); submitting.current = false;
    }
    // Changes to the fee list during review must not silently change the confirmed snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, batch.id, batch.coachingFeeMode]);

  const monthly = batch.coachingFeeMode === 'MONTH_COVERAGE';
  const bounds = getBatchMonthBounds(batch);
  const installments = batch.feeInstallments.filter(item => !item.studentId);
  const close = () => { if (!submitting.current) { Keyboard.dismiss(); onClose(); } };
  const prepareReview = () => {
    try {
      const payload = buildBatchInvitePayload(batch, {
        phone, decision, installmentIds: selected, applyFutureInstallments: applyFuture, feeStartMonth: feeMonth,
      });
      Keyboard.dismiss(); setError(''); setReview(payload);
    } catch (failure) { setError(invitationError(failure)); }
  };
  const send = async () => {
    if (!review || submitting.current) return;
    submitting.current = true; setBusy(true); setError('');
    const version = generation.current;
    try {
      await api.post(`/batches/${batch.id}/invite`, review);
      if (mounted.current && generation.current === version) {
        setSuccess(true);
        onSuccess?.();
      }
    } catch (failure) {
      if (mounted.current && generation.current === version) setError(invitationError(failure));
    } finally {
      if (mounted.current && generation.current === version) { submitting.current = false; setBusy(false); }
    }
  };
  const reviewFee = review?.fee;
  const reviewedTotal = reviewFee?.mode === 'CURRENT_DUE_BASED'
    ? Object.values(reviewFee.amounts || {}).reduce((sum, amount) => sum + amount, 0) : 0;
  const choiceRows: Array<{ value: Decision; title: string; description: string }> = [
    { value: 'SELECTED', title: 'Choose installments', description: 'Apply only the fees you select below.' },
    { value: 'NO_FEE', title: 'No fee for this enrollment', description: 'Confirm that no current fee applies.' },
    { value: 'LATER', title: 'Decide fees later', description: 'Keep fee setup pending until you assign it.' },
  ];
  const panel = { backgroundColor: colors.surfaceSecondary, borderColor: colors.border };
  return (
    <Modal visible={visible} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={close}>
      <View style={[s.overlay, { backgroundColor: colors.overlay }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss student invitation" disabled={busy} onPress={close} style={StyleSheet.absoluteFill} />
        <KeyboardAvoidingView style={s.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} pointerEvents="box-none">
          <SafeAreaView edges={['bottom']} style={[s.sheet, { backgroundColor: colors.surface }]}>
            <View style={[s.handle, { backgroundColor: colors.textMuted }]} />
            <View style={s.header}>
              <View style={s.flex}>
                <Text accessibilityRole="header" style={[s.title, { color: colors.text }]}>{success ? 'Invitation queued' : review ? 'Review invitation' : 'Add student'}</Text>
                <Text style={[s.secondary, { color: colors.textSecondary }]}>{batch.name}</Text>
              </View>
              <PressableScale disabled={busy} accessibilityLabel="Close student invitation" onPress={close} style={s.iconButton}><X size={22} color={colors.text} /></PressableScale>
            </View>
            <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {success ? (
                <View style={s.success}>
                  <CheckCircle2 size={42} color={colors.positive} />
                  <Text style={[s.body, { color: colors.text }]}>The registration invitation has been queued for WhatsApp delivery.</Text>
                  <Text style={[s.secondary, { color: colors.textSecondary }]}>The student can complete registration using the link. Their fee choice is the one you reviewed.</Text>
                </View>
              ) : review ? (
                <>
                  <View style={[s.panel, panel]}>
                    <Text style={[s.label, { color: colors.textSecondary }]}>Send registration link to</Text>
                    <Text selectable style={[s.reviewPhone, { color: colors.text }]}>{review.whatsappNumber}</Text>
                    <Text style={[s.secondary, { color: colors.textSecondary }]}>WhatsApp invitation · {batch.name}</Text>
                  </View>
                  <View style={[s.panel, panel]}>
                    <Text style={[s.label, { color: colors.textSecondary }]}>Confirmed fee plan</Text>
                    {reviewFee?.mode === 'MONTH_COVERAGE' ? <Text style={[s.body, { color: colors.text }]}>Fee starts from {reviewFee.feeStartMonth}</Text> : (
                      <>
                        <Text style={[s.body, { color: colors.text }]}>{reviewFee?.decision === 'LATER' ? 'Fees pending teacher decision' : reviewFee?.decision === 'NO_FEE' ? 'No fee for this enrollment' : `₹${reviewedTotal.toLocaleString('en-IN')} in selected installments`}</Text>
                        {reviewFee?.mode === 'CURRENT_DUE_BASED' && reviewFee.installmentIds.map(id => <Text key={id} style={[s.secondary, { color: colors.textSecondary }]}>{installments.find(item => item.id === id)?.name || 'Selected installment'} · ₹{reviewFee.amounts?.[id]?.toLocaleString('en-IN')}</Text>)}
                        <Text style={[s.secondary, { color: colors.textSecondary }]}>{reviewFee?.mode === 'CURRENT_DUE_BASED' && reviewFee.applyFutureInstallments ? 'Future batch installments will apply automatically.' : 'Future installments require a separate teacher assignment.'}</Text>
                      </>
                    )}
                  </View>
                  <PressableScale disabled={busy} accessibilityLabel="Edit invitation details" onPress={() => { setReview(null); setError(''); }} style={s.back}><ChevronLeft size={18} color={colors.text} /><Text style={[s.label, { color: colors.text }]}>Edit details</Text></PressableScale>
                </>
              ) : (
                <>
                  <Text style={[s.body, { color: colors.textSecondary }]}>Send a registration invitation and confirm the fee plan before the student joins.</Text>
                  <View style={s.group}>
                    <Text style={[s.label, { color: colors.text }]}>Student’s WhatsApp number</Text>
                    <TextInput accessibilityLabel="Student WhatsApp number" keyboardType="phone-pad" autoComplete="tel" value={phone} onChangeText={value => { setPhone(value); setError(''); }} placeholder="10-digit number or +91…" placeholderTextColor={colors.textMuted} style={[s.input, panel, { color: colors.text }]} />
                  </View>
                  {monthly ? (
                    <View style={s.group}>
                      <Text style={[s.label, { color: colors.text }]}>Fee starts from</Text>
                      <TextInput accessibilityLabel="Fee start month in YYYY-MM format" value={feeMonth} onChangeText={value => { setFeeMonth(value); setError(''); }} placeholder="YYYY-MM" autoCapitalize="none" maxLength={7} placeholderTextColor={colors.textMuted} style={[s.input, panel, { color: colors.text }]} />
                      <Text style={[s.secondary, { color: colors.textSecondary }]}>{bounds ? `Choose a month from ${bounds.first} to ${bounds.last}. An earlier valid batch month can be selected.` : 'Set the batch start and end dates before inviting students.'}</Text>
                    </View>
                  ) : (
                    <View style={s.group}>
                      <Text style={[s.label, { color: colors.text }]}>Fee decision</Text>
                      {choiceRows.map(choice => (
                        <PressableScale key={choice.value} accessibilityRole="radio" accessibilityState={{ checked: decision === choice.value }} accessibilityLabel={choice.title} onPress={() => { setDecision(choice.value); setSelected([]); setApplyFuture(false); setError(''); }} style={[s.choice, panel, decision === choice.value && { borderColor: colors.focus }]}>
                          <View style={s.flex}><Text style={[s.body, { color: colors.text }]}>{choice.title}</Text><Text style={[s.secondary, { color: colors.textSecondary }]}>{choice.description}</Text></View>
                          <View style={[s.radio, { borderColor: decision === choice.value ? colors.focus : colors.border }]}>{decision === choice.value && <View style={[s.radioDot, { backgroundColor: colors.focus }]} />}</View>
                        </PressableScale>
                      ))}
                      {decision === 'SELECTED' && (
                        <>
                          {!installments.length && <Text style={[s.secondary, { color: colors.textSecondary }]}>Create a batch installment first, or choose no fee / decide later.</Text>}
                          {installments.map(item => {
                            const checked = selected.includes(item.id);
                            return <PressableScale key={item.id} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={`${item.name || 'Installment'}, ₹${item.amount}`} onPress={() => { setSelected(ids => checked ? ids.filter(id => id !== item.id) : [...ids, item.id]); setError(''); }} style={[s.choice, panel]}>
                              <View style={s.flex}><Text style={[s.body, { color: colors.text }]}>{item.name || 'Installment'}</Text><Text style={[s.secondary, { color: colors.textSecondary }]}>₹{item.amount.toLocaleString('en-IN')}</Text></View>
                              <View style={[s.checkbox, { backgroundColor: checked ? colors.focus : 'transparent', borderColor: colors.focus }]}>{checked && <Check size={16} color={colors.background} />}</View>
                            </PressableScale>;
                          })}
                          <PressableScale accessibilityRole="checkbox" accessibilityState={{ checked: applyFuture }} accessibilityLabel="Apply future batch installments automatically" onPress={() => setApplyFuture(value => !value)} style={s.future}>
                            <View style={[s.checkbox, { backgroundColor: applyFuture ? colors.focus : 'transparent', borderColor: colors.focus }]}>{applyFuture && <Check size={16} color={colors.background} />}</View>
                            <Text style={[s.secondary, s.flex, { color: colors.text }]}>Apply future batch installments automatically</Text>
                          </PressableScale>
                        </>
                      )}
                    </View>
                  )}
                </>
              )}
              {error ? <View accessibilityLiveRegion="polite" style={[s.panel, panel, { borderColor: colors.attention }]}><Text accessibilityRole="alert" style={[s.body, { color: colors.text }]}>{error}</Text></View> : null}
              <PressableScale disabled={busy} accessibilityState={{ busy, disabled: busy }} accessibilityLabel={success ? 'Done' : review ? 'Send WhatsApp invitation' : 'Review invitation'} onPress={success ? close : review ? () => void send() : prepareReview} style={[s.submit, { backgroundColor: colors.hero, opacity: busy ? 0.7 : 1 }]}>
                {busy ? <ActivityIndicator color={colors.heroText} /> : review && !success ? <Send size={19} color={colors.heroText} /> : null}
                <Text style={[s.buttonText, { color: colors.heroText }]}>{success ? 'Done' : busy ? 'Sending…' : review ? 'Send WhatsApp invitation' : 'Review invitation'}</Text>
              </PressableScale>
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1 }, keyboard: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '92%', borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
  handle: { width: 34, height: 4, borderRadius: 3, opacity: 0.35, alignSelf: 'center', marginTop: 9 },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1, minWidth: 0 }, title: { ...TypeScale.pageTitle, fontSize: 24, lineHeight: 30 },
  body: { ...TypeScale.body }, secondary: { ...TypeScale.label, fontWeight: '400', marginTop: 4 }, label: { ...TypeScale.label },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingBottom: 28, gap: 18 }, group: { gap: 10 },
  input: { borderWidth: 1, borderRadius: 14, minHeight: 52, paddingHorizontal: 14, paddingVertical: 12, ...TypeScale.body },
  panel: { borderWidth: 1, padding: 16, borderRadius: 17, gap: 5 },
  choice: { minHeight: 64, borderWidth: 1, padding: 14, borderRadius: 15, flexDirection: 'row', alignItems: 'center', gap: 14 },
  radio: { width: 22, height: 22, borderWidth: 1.5, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  radioDot: { width: 12, height: 12, borderRadius: 6 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  future: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 },
  submit: { minHeight: 52, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9 },
  buttonText: { ...TypeScale.sectionTitle, textAlign: 'center', flexShrink: 1 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 44 },
  success: { gap: 14, paddingVertical: 16 }, reviewPhone: { ...TypeScale.sectionTitle, fontSize: 23, lineHeight: 30 },
});
