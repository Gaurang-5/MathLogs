import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
  type TextInputInstance,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, ArrowRight, Check, MessageCircle } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { BorderRadius, Colors, FontSize, FontWeight, Spacing, TouchTarget, TypeScale } from '../constants/theme';

type Step = 'phone' | 'otp' | 'details';
const colors = Colors.light;
const cleanPhone = (value: string) => value.replace(/\D/g, '').slice(0, 10);

export default function SignupScreen() {
  const router = useRouter();
  const { requestSignupOtp, verifySignupOtp, completeSignup } = useAuth();
  const otpRef = useRef<TextInputInstance>(null);
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [instituteName, setInstituteName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(30);
  const stepNumber = step === 'phone' ? 1 : step === 'otp' ? 2 : 3;

  useEffect(() => {
    if (step !== 'otp' || resendSeconds <= 0) return;
    const timer = setInterval(() => setResendSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendSeconds, step]);

  const fail = (message: string) => {
    setError(message);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  };

  const sendOtp = async () => {
    const value = cleanPhone(phone);
    if (value.length !== 10) return fail('Enter a valid 10-digit mobile number.');
    setBusy(true);
    setError('');
    try {
      await requestSignupOtp(value);
      setOtp('');
      setStep('otp');
      setResendSeconds(30);
      setTimeout(() => otpRef.current?.focus(), 120);
    } catch (reason: any) {
      fail(reason.message || 'Could not send the OTP.');
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    if (otp.length !== 6) return fail('Enter the complete 6-digit code.');
    setBusy(true);
    setError('');
    try {
      const token = await verifySignupOtp(cleanPhone(phone), otp);
      setVerificationToken(token);
      setStep('details');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (reason: any) {
      setOtp('');
      fail(reason.message || 'The code could not be verified.');
    } finally {
      setBusy(false);
    }
  };

  const createAccount = async () => {
    if (teacherName.trim().length < 2) return fail('Enter your name.');
    if (instituteName.trim().length < 2) return fail('Enter your institute or coaching name.');
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return fail('Enter a valid email address or leave it blank.');
    setBusy(true);
    setError('');
    try {
      await completeSignup({
        phone: cleanPhone(phone),
        verificationToken,
        teacherName: teacherName.trim(),
        instituteName: instituteName.trim(),
        email: email.trim() || undefined,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)');
    } catch (reason: any) {
      fail(reason.message || 'Could not create your account.');
    } finally {
      setBusy(false);
    }
  };

  const goBack = () => {
    setError('');
    if (step === 'details') setStep('otp');
    else if (step === 'otp') setStep('phone');
    else router.replace('/login');
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.topRow}>
            <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={goBack} style={styles.iconButton}><ArrowLeft size={20} color={colors.text} /></Pressable>
            <Text style={styles.progress}>Step {stepNumber} of 3</Text>
          </View>

          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${stepNumber * 33.333}%` }]} /></View>

          <View style={styles.heading}>
            <Text style={styles.eyebrow}>START WITH BASIC</Text>
            <Text accessibilityRole="header" style={styles.title}>
              {step === 'phone' ? 'Create your account' : step === 'otp' ? 'Verify your number' : 'Set up your workspace'}
            </Text>
            <Text style={styles.subtitle}>
              {step === 'phone'
                ? 'Basic includes the offline teacher workspace and manual student addition.'
                : step === 'otp'
                  ? `Enter the code sent to +91 ${cleanPhone(phone)} on WhatsApp.`
                  : 'These details appear in your dashboard and teacher profile.'}
            </Text>
          </View>

          {error ? <View accessibilityRole="alert" style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}

          <View style={styles.card}>
            {step === 'phone' ? (
              <>
                <Text style={styles.label}>WhatsApp mobile number</Text>
                <View style={[styles.inputShell, error && styles.inputError]}>
                  <Text style={styles.prefix}>+91</Text>
                  <TextInput value={phone} onChangeText={(value) => { setPhone(cleanPhone(value)); setError(''); }} placeholder="98765 43210" placeholderTextColor={colors.textMuted} keyboardType="number-pad" autoComplete="tel" textContentType="telephoneNumber" maxLength={10} autoFocus style={styles.phoneInput} />
                </View>
                <View style={styles.helperRow}><MessageCircle size={16} color={colors.positive} /><Text style={styles.helper}>We use this number for secure passwordless sign-in.</Text></View>
                <PrimaryButton label="Send verification code" busy={busy} onPress={() => void sendOtp()} />
              </>
            ) : null}

            {step === 'otp' ? (
              <>
                <Text style={styles.label}>6-digit code</Text>
                <TextInput ref={otpRef} value={otp} onChangeText={(value) => { setOtp(value.replace(/\D/g, '').slice(0, 6)); setError(''); }} placeholder="••••••" placeholderTextColor={colors.textMuted} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="sms-otp" maxLength={6} autoFocus style={[styles.otpInput, error && styles.inputError]} />
                <View style={styles.otpMeta}>
                  <Pressable accessibilityRole="button" onPress={() => setStep('phone')} hitSlop={8}><Text style={styles.textButton}>Change number</Text></Pressable>
                  <Pressable accessibilityRole="button" disabled={resendSeconds > 0 || busy} onPress={() => void sendOtp()} hitSlop={8}><Text style={[styles.textButton, resendSeconds > 0 && styles.muted]}>{resendSeconds > 0 ? `Resend in ${resendSeconds}s` : 'Resend code'}</Text></Pressable>
                </View>
                <PrimaryButton label="Verify number" busy={busy} onPress={() => void verifyOtp()} />
              </>
            ) : null}

            {step === 'details' ? (
              <>
                <Field label="Your name" value={teacherName} onChangeText={(value) => { setTeacherName(value); setError(''); }} placeholder="Manoj Patil" autoCapitalize="words" />
                <Field label="Institute or coaching name" value={instituteName} onChangeText={(value) => { setInstituteName(value); setError(''); }} placeholder="Patil Mathematics Academy" autoCapitalize="words" />
                <Field label="Email (optional)" value={email} onChangeText={(value) => { setEmail(value); setError(''); }} placeholder="teacher@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
                <View style={styles.planNote}>
                  <View style={styles.checkCircle}><Check size={14} color={colors.heroText} /></View>
                  <View style={styles.planCopy}><Text style={styles.planTitle}>Basic plan</Text><Text style={styles.planDescription}>Offline batches, students, tests, marks, fees and manual student addition. Upgrade to Pro later for online and AI features.</Text></View>
                </View>
                <PrimaryButton label="Create Basic account" busy={busy} onPress={() => void createAccount()} />
              </>
            ) : null}
          </View>

          <View style={styles.signinRow}><Text style={styles.signinText}>Already have an account?</Text><Pressable accessibilityRole="button" onPress={() => router.replace('/login')} hitSlop={8}><Text style={styles.signinLink}>Sign in</Text></Pressable></View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...inputProps } = props;
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...inputProps} placeholderTextColor={colors.textMuted} style={styles.textInput} /></View>;
}

function PrimaryButton({ label, busy, onPress }: { label: string; busy: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ busy, disabled: busy }} disabled={busy} onPress={onPress} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, busy && styles.disabled]}>{busy ? <ActivityIndicator color={colors.heroText} /> : <><Text style={styles.primaryButtonText}>{label}</Text><ArrowRight size={19} color={colors.heroText} /></>}</Pressable>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing['2xl'], gap: Spacing.xl },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: TouchTarget.minimum, height: TouchTarget.minimum, borderRadius: BorderRadius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  progress: { ...TypeScale.label, color: colors.textSecondary },
  progressTrack: { height: 4, backgroundColor: colors.backgroundDeep, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: colors.chart, borderRadius: 2 },
  heading: { gap: Spacing.sm },
  eyebrow: { ...TypeScale.caption, color: colors.textSecondary, letterSpacing: 1.4, fontWeight: FontWeight.bold },
  title: { fontSize: FontSize['3xl'], lineHeight: 40, letterSpacing: -1, color: colors.text, fontWeight: FontWeight.bold },
  subtitle: { ...TypeScale.body, color: colors.textSecondary },
  errorBox: { backgroundColor: Colors.errorBg, borderRadius: BorderRadius.md, padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(255,59,48,0.2)' },
  errorText: { ...TypeScale.label, color: Colors.error },
  card: { backgroundColor: colors.surface, borderRadius: BorderRadius['2xl'], borderWidth: 1, borderColor: colors.border, padding: Spacing.xl, gap: Spacing.lg },
  field: { gap: Spacing.sm },
  label: { ...TypeScale.label, color: colors.text },
  inputShell: { minHeight: 56, flexDirection: 'row', alignItems: 'center', borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, paddingHorizontal: Spacing.lg },
  prefix: { marginRight: Spacing.md, fontSize: FontSize.md, color: colors.textSecondary, fontWeight: FontWeight.semibold },
  phoneInput: { flex: 1, minWidth: 0, paddingVertical: Spacing.md, fontSize: FontSize.lg, color: colors.text, fontWeight: FontWeight.semibold },
  textInput: { minHeight: 52, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, paddingHorizontal: Spacing.lg, color: colors.text, fontSize: FontSize.base },
  inputError: { borderColor: Colors.error },
  helperRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  helper: { ...TypeScale.caption, flex: 1, color: colors.textSecondary },
  otpInput: { minHeight: 64, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, color: colors.text, textAlign: 'center', fontSize: FontSize['2xl'], fontWeight: FontWeight.bold, letterSpacing: 10 },
  otpMeta: { minHeight: TouchTarget.minimum, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  textButton: { ...TypeScale.label, color: colors.focus },
  muted: { color: colors.textMuted },
  planNote: { flexDirection: 'row', gap: Spacing.md, backgroundColor: colors.surfaceSecondary, padding: Spacing.md, borderRadius: BorderRadius.lg },
  checkCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.hero, alignItems: 'center', justifyContent: 'center' },
  planCopy: { flex: 1, gap: Spacing.xs },
  planTitle: { ...TypeScale.label, color: colors.text },
  planDescription: { ...TypeScale.caption, color: colors.textSecondary },
  primaryButton: { minHeight: 54, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.lg, backgroundColor: colors.hero, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  primaryButtonText: { ...TypeScale.label, fontSize: FontSize.base, color: colors.heroText, fontWeight: FontWeight.bold },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.55 },
  signinRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: Spacing.sm },
  signinText: { ...TypeScale.label, color: colors.textSecondary },
  signinLink: { ...TypeScale.label, color: colors.text, textDecorationLine: 'underline' },
});
