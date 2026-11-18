import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
  type TextInputInstance,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, ArrowRight, Building2, MessageCircle, User } from 'lucide-react-native';
import { LoginAccount, useAuth } from '../contexts/AuthContext';
import { BorderRadius, Colors, FontSize, FontWeight, Spacing, TouchTarget, TypeScale } from '../constants/theme';

type Step = 'phone' | 'otp' | 'account';
const colors = Colors.light;
const cleanPhone = (value: string) => value.replace(/\D/g, '').slice(0, 10);
const demoPhone = cleanPhone(process.env.EXPO_PUBLIC_DEMO_BASIC_PHONE || '');

export default function LoginScreen() {
  const router = useRouter();
  const { requestLoginOtp, verifyLoginOtp, selectLoginAccount } = useAuth();
  const otpRef = useRef<TextInputInstance>(null);
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [accounts, setAccounts] = useState<LoginAccount[]>([]);
  const [tempAuthToken, setTempAuthToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(30);
  const otpLength = demoPhone && cleanPhone(phone) === demoPhone ? 5 : 6;

  useEffect(() => {
    if (step !== 'otp' || resendSeconds <= 0) return;
    const timer = setInterval(() => setResendSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendSeconds, step]);

  const fail = useCallback((message: string) => {
    setError(message);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }, []);

  const sendOtp = useCallback(async () => {
    const value = cleanPhone(phone);
    if (value.length !== 10) return fail('Enter a valid 10-digit mobile number.');
    setBusy(true);
    setError('');
    try {
      await requestLoginOtp(value);
      setOtp('');
      setStep('otp');
      setResendSeconds(30);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => otpRef.current?.focus(), 120);
    } catch (reason: any) {
      fail(reason.message || 'Could not send the OTP.');
    } finally {
      setBusy(false);
    }
  }, [fail, phone, requestLoginOtp]);

  const verify = useCallback(async () => {
    if (otp.length !== otpLength) return fail(`Enter the complete ${otpLength}-digit code.`);
    setBusy(true);
    setError('');
    try {
      const result = await verifyLoginOtp(cleanPhone(phone), otp);
      if (result.requiresAccountSelection && result.tempAuthToken) {
        setAccounts(result.accounts);
        setTempAuthToken(result.tempAuthToken);
        setStep('account');
      } else {
        router.replace('/(tabs)');
      }
    } catch (reason: any) {
      setOtp('');
      fail(reason.message || 'The code could not be verified.');
      setTimeout(() => otpRef.current?.focus(), 100);
    } finally {
      setBusy(false);
    }
  }, [fail, otp, otpLength, phone, router, verifyLoginOtp]);

  const chooseAccount = useCallback(async (account: LoginAccount) => {
    setBusy(true);
    setError('');
    try {
      await selectLoginAccount(account.adminId, tempAuthToken, cleanPhone(phone));
      router.replace('/(tabs)');
    } catch (reason: any) {
      fail(reason.message || 'Could not open this account.');
    } finally {
      setBusy(false);
    }
  }, [fail, phone, router, selectLoginAccount, tempAuthToken]);

  const goBack = () => {
    if (step === 'phone') {
      if (router.canGoBack()) router.back();
      return;
    }
    setStep(step === 'account' ? 'otp' : 'phone');
    setError('');
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.topRow}>
            <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={goBack} style={styles.iconButton}>
              <ArrowLeft size={20} color={colors.text} />
            </Pressable>
            <View style={styles.brandMark}><Text style={styles.brandMarkText}>M</Text></View>
          </View>

          <View style={styles.heading}>
            <Text style={styles.eyebrow}>MATHLOGS FOR TEACHERS</Text>
            <Text accessibilityRole="header" style={styles.title}>{step === 'account' ? 'Choose account' : 'Welcome back'}</Text>
            <Text style={styles.subtitle}>
              {step === 'phone'
                ? 'Sign in with the WhatsApp number linked to your coaching account.'
                : step === 'otp'
                  ? `Enter the ${otpLength}-digit code for +91 ${cleanPhone(phone)}.`
                  : 'This number is linked to more than one coaching account.'}
            </Text>
          </View>

          {error ? <View accessibilityRole="alert" style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}

          <View style={styles.card}>
            {step === 'phone' ? (
              <>
                <Text style={styles.label}>Mobile number</Text>
                <View style={[styles.inputShell, error && styles.inputShellError]}>
                  <Text style={styles.prefix}>+91</Text>
                  <TextInput
                    value={phone}
                    onChangeText={(value) => { setPhone(cleanPhone(value)); setError(''); }}
                    placeholder="98765 43210"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="number-pad"
                    autoComplete="tel"
                    textContentType="telephoneNumber"
                    maxLength={10}
                    autoFocus
                    style={styles.phoneInput}
                    accessibilityLabel="10-digit mobile number"
                  />
                </View>
                <View style={styles.helperRow}>
                  <MessageCircle size={16} color={colors.positive} />
                  <Text style={styles.helper}>We will send a one-time code to your WhatsApp.</Text>
                </View>
                <PrimaryButton label="Send OTP" busy={busy} onPress={() => void sendOtp()} />
              </>
            ) : null}

            {step === 'otp' ? (
              <>
                <Text style={styles.label}>One-time code</Text>
                <TextInput
                  ref={otpRef}
                  value={otp}
                  onChangeText={(value) => { setOtp(value.replace(/\D/g, '').slice(0, otpLength)); setError(''); }}
                  placeholder={'•'.repeat(otpLength)}
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  maxLength={otpLength}
                  autoFocus
                  style={[styles.otpInput, error && styles.inputShellError]}
                  accessibilityLabel={`${otpLength}-digit one-time code`}
                />
                <View style={styles.otpMeta}>
                  <Pressable accessibilityRole="button" onPress={() => setStep('phone')} hitSlop={8}><Text style={styles.textButton}>Change number</Text></Pressable>
                  <Pressable accessibilityRole="button" disabled={resendSeconds > 0 || busy} onPress={() => void sendOtp()} hitSlop={8}>
                    <Text style={[styles.textButton, resendSeconds > 0 && styles.textButtonDisabled]}>{resendSeconds > 0 ? `Resend in ${resendSeconds}s` : 'Resend code'}</Text>
                  </Pressable>
                </View>
                <PrimaryButton label="Verify and continue" busy={busy} onPress={() => void verify()} />
              </>
            ) : null}

            {step === 'account' ? (
              <View style={styles.accountList}>
                {accounts.map((account) => (
                  <Pressable key={account.adminId} accessibilityRole="button" accessibilityLabel={`Open ${account.instituteName}`} disabled={busy} onPress={() => void chooseAccount(account)} style={({ pressed }) => [styles.accountRow, pressed && styles.pressed]}>
                    <View style={styles.accountIcon}><Building2 size={20} color={colors.text} /></View>
                    <View style={styles.accountCopy}>
                      <Text style={styles.accountName}>{account.instituteName}</Text>
                      <View style={styles.accountTeacherRow}><User size={14} color={colors.textSecondary} /><Text style={styles.accountTeacher}>{account.teacherName}</Text></View>
                    </View>
                    <ArrowRight size={20} color={colors.textSecondary} />
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          {step === 'phone' ? (
            <View style={styles.signupRow}>
              <Text style={styles.signupText}>New to MathLogs?</Text>
              <Pressable accessibilityRole="button" onPress={() => router.push('/signup')} hitSlop={8}><Text style={styles.signupLink}>Create a Basic account</Text></Pressable>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PrimaryButton({ label, busy, onPress }: { label: string; busy: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ busy, disabled: busy }} disabled={busy} onPress={onPress} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, busy && styles.disabled]}>
      {busy ? <ActivityIndicator color={colors.heroText} /> : <><Text style={styles.primaryButtonText}>{label}</Text><ArrowRight size={19} color={colors.heroText} /></>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing['2xl'], gap: Spacing['2xl'] },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: TouchTarget.minimum, height: TouchTarget.minimum, borderRadius: BorderRadius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  brandMark: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.hero, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: colors.heroText, fontSize: FontSize.lg, fontWeight: FontWeight.black },
  heading: { gap: Spacing.sm },
  eyebrow: { ...TypeScale.caption, color: colors.textSecondary, letterSpacing: 1.4, fontWeight: FontWeight.bold },
  title: { fontSize: FontSize['3xl'], lineHeight: 40, letterSpacing: -1, color: colors.text, fontWeight: FontWeight.bold },
  subtitle: { ...TypeScale.body, color: colors.textSecondary, maxWidth: 520 },
  errorBox: { backgroundColor: Colors.errorBg, borderRadius: BorderRadius.md, padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,59,48,0.2)' },
  errorText: { ...TypeScale.label, color: Colors.error },
  card: { backgroundColor: colors.surface, borderRadius: BorderRadius['2xl'], borderWidth: 1, borderColor: colors.border, padding: Spacing.xl, gap: Spacing.lg },
  label: { ...TypeScale.label, color: colors.text },
  inputShell: { minHeight: 58, flexDirection: 'row', alignItems: 'center', borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, paddingHorizontal: Spacing.lg },
  inputShellError: { borderColor: Colors.error },
  prefix: { marginRight: Spacing.md, fontSize: FontSize.md, color: colors.textSecondary, fontWeight: FontWeight.semibold },
  phoneInput: { flex: 1, minWidth: 0, paddingVertical: Spacing.md, fontSize: FontSize.lg, letterSpacing: 1.2, color: colors.text, fontWeight: FontWeight.semibold },
  helperRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  helper: { ...TypeScale.caption, flex: 1, color: colors.textSecondary },
  primaryButton: { minHeight: 54, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.lg, backgroundColor: colors.hero, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  primaryButtonText: { ...TypeScale.label, fontSize: FontSize.base, color: colors.heroText, fontWeight: FontWeight.bold },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.55 },
  otpInput: { minHeight: 64, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, color: colors.text, textAlign: 'center', fontSize: FontSize['2xl'], fontWeight: FontWeight.bold, letterSpacing: 10, paddingHorizontal: Spacing.md },
  otpMeta: { minHeight: TouchTarget.minimum, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  textButton: { ...TypeScale.label, color: colors.focus },
  textButtonDisabled: { color: colors.textMuted },
  accountList: { gap: Spacing.sm },
  accountRow: { minHeight: 80, borderRadius: BorderRadius.lg, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, padding: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  accountIcon: { width: 44, height: 44, borderRadius: BorderRadius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  accountCopy: { flex: 1, gap: Spacing.xs },
  accountName: { ...TypeScale.sectionTitle, color: colors.text },
  accountTeacherRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  accountTeacher: { ...TypeScale.caption, color: colors.textSecondary },
  signupRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
  signupText: { ...TypeScale.label, color: colors.textSecondary },
  signupLink: { ...TypeScale.label, color: colors.text, textDecorationLine: 'underline' },
});
