import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Dimensions, Keyboard, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type TextInputInstance,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing, FadeInDown, FadeInUp, useAnimatedStyle, useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';
import {
  AlertCircle, ArrowLeft, ArrowRight, Building2, MessageSquare, RotateCcw, User,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { LoginAccount, useAuth } from '../contexts/AuthContext';
import { FontSize, FontWeight, LoginTokens, Spacing, TouchTarget, TypeScale } from '../constants/theme';

const { width, height } = Dimensions.get('window');
const T = LoginTokens;
type LoginStep = 'phone' | 'otp' | 'select_account';
const cleanPhone = (value: string) => value.replace(/\D/g, '').slice(0, 10);

function AnimatedBackground() {
  const rotation1 = useSharedValue(0);
  const rotation2 = useSharedValue(0);
  const translateY = useSharedValue(-height * 0.1);
  const translateX = useSharedValue(-width * 0.1);

  useEffect(() => {
    rotation1.value = withRepeat(withTiming(360, { duration: 60000, easing: Easing.linear }), -1);
    rotation2.value = withRepeat(withTiming(-360, { duration: 80000, easing: Easing.linear }), -1);
    translateY.value = withRepeat(withTiming(height * 1.1, { duration: 8000, easing: Easing.linear }), -1);
    translateX.value = withRepeat(withTiming(width * 1.1, { duration: 12000, easing: Easing.linear }), -1);
  }, [rotation1, rotation2, translateX, translateY]);

  const shape1Style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation1.value}deg` }] }));
  const shape2Style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation2.value}deg` }] }));
  const scanHStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const scanVStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[s.scanHorizontal, scanHStyle]} />
      <Animated.View style={[s.scanVertical, scanVStyle]} />
      <Animated.View style={[s.bgShape1, shape1Style]} />
      <Animated.View style={[s.bgShape2, shape2Style]} />
    </View>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const { requestLoginOtp, verifyLoginOtp, selectLoginAccount } = useAuth();
  const otpInputRef = useRef<TextInputInstance>(null);
  const [step, setStep] = useState<LoginStep>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [accounts, setAccounts] = useState<LoginAccount[]>([]);
  const [tempAuthToken, setTempAuthToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [error, setError] = useState('');
  const [resendTimer, setResendTimer] = useState(30);
  const [phoneFocused, setPhoneFocused] = useState(false);

  useEffect(() => {
    if (step !== 'otp' || resendTimer <= 0) return;
    const timer = setInterval(() => setResendTimer((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => clearInterval(timer);
  }, [step, resendTimer]);

  const showError = useCallback((message: string) => {
    setError(message);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }, []);

  const sendOtp = useCallback(async () => {
    const cleaned = cleanPhone(phone);
    if (cleaned.length !== 10) {
      showError('Please enter a valid 10-digit mobile number.');
      return;
    }
    Keyboard.dismiss();
    setError('');
    setIsLoading(true);
    setLoadingText('Sending OTP...');
    try {
      await requestLoginOtp(cleaned);
      setOtp('');
      setStep('otp');
      setResendTimer(30);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => otpInputRef.current?.focus(), 150);
    } catch (err: any) {
      showError(err.message || 'Failed to send OTP.');
    } finally {
      setIsLoading(false);
      setLoadingText('');
    }
  }, [phone, requestLoginOtp, showError]);

  const verifyOtp = useCallback(async (code = otp) => {
    if (code.length !== 6 || isLoading) {
      if (code.length !== 6) showError('Please enter the complete 6-digit OTP.');
      return;
    }
    Keyboard.dismiss();
    setError('');
    setIsLoading(true);
    setLoadingText('Verifying OTP...');
    try {
      const result = await verifyLoginOtp(cleanPhone(phone), code);
      if (result.requiresAccountSelection && result.tempAuthToken) {
        setAccounts(result.accounts);
        setTempAuthToken(result.tempAuthToken);
        setStep('select_account');
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      }
      setLoadingText('Loading Dashboard...');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)');
    } catch (err: any) {
      showError(err.message || 'OTP verification failed.');
      setOtp('');
      setTimeout(() => otpInputRef.current?.focus(), 100);
    } finally {
      setIsLoading(false);
      setLoadingText('');
    }
  }, [isLoading, otp, phone, router, showError, verifyLoginOtp]);

  const chooseAccount = useCallback(async (account: LoginAccount) => {
    if (isLoading) return;
    setError('');
    setIsLoading(true);
    setLoadingText('Loading Dashboard...');
    try {
      await selectLoginAccount(account.adminId, tempAuthToken, cleanPhone(phone));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)');
    } catch (err: any) {
      showError(err.message || 'Failed to select account.');
    } finally {
      setIsLoading(false);
      setLoadingText('');
    }
  }, [isLoading, phone, router, selectLoginAccount, showError, tempAuthToken]);

  const updateOtp = (value: string) => {
    const next = value.replace(/\D/g, '').slice(0, 6);
    const shouldVerify = next.length === 6 && otp.length !== 6;
    setOtp(next);
    setError('');
    if (shouldVerify) setTimeout(() => void verifyOtp(next), 80);
  };

  const changeNumber = () => {
    setStep('phone');
    setOtp('');
    setAccounts([]);
    setTempAuthToken('');
    setError('');
  };

  const subtitle = step === 'phone'
    ? 'Enter your WhatsApp number to receive a one-time sign-in code.'
    : step === 'otp'
      ? `Enter the 6-digit code sent to +91 ${cleanPhone(phone)} via WhatsApp.`
      : 'Choose the coaching account you want to open.';

  return (
    <View style={s.container}>
      <AnimatedBackground />
      <SafeAreaView style={s.safeArea}>
        <View style={s.topBar}>
          {router.canGoBack() ? (
            <Pressable onPress={() => router.back()} style={({ pressed }) => [s.backBtn, pressed && s.pressed]} accessibilityRole="button" accessibilityLabel="Return to previous screen">
              <ArrowLeft size={16} color={T.mutedForeground} strokeWidth={3} />
              <Text style={s.backText}>RETURN</Text>
            </Pressable>
          ) : null}
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.keyboardView}>
          <ScrollView contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Animated.View entering={FadeInDown.duration(700)}>
              <Text style={s.title}>MathLogs.</Text>
              <Text style={s.subtitle}>{subtitle}</Text>
            </Animated.View>

            {error ? (
              <Animated.View entering={FadeInDown.duration(300)} style={s.errorBox} accessibilityRole="alert">
                <View style={s.errorLine} />
                <AlertCircle size={20} color={T.destructive} style={s.errorIcon} />
                <Text style={s.errorText}>{error}</Text>
              </Animated.View>
            ) : null}

            <Animated.View entering={FadeInUp.duration(600).delay(80)} style={s.formArea}>
              {step === 'phone' ? (
                <>
                  <View>
                    <Text style={s.fieldLabel}>MOBILE NUMBER</Text>
                    <View style={[s.phoneRow, phoneFocused && s.phoneRowFocused, !!error && s.inputError]}>
                      <Text style={s.phonePrefix}>+91</Text>
                      <TextInput
                        style={s.phoneInput}
                        value={phone}
                        onChangeText={(value) => { setPhone(cleanPhone(value)); setError(''); }}
                        placeholder="98765 43210"
                        placeholderTextColor={T.placeholder}
                        keyboardType="number-pad"
                        autoComplete="tel"
                        textContentType="telephoneNumber"
                        maxLength={10}
                        autoFocus
                        onFocus={() => setPhoneFocused(true)}
                        onBlur={() => setPhoneFocused(false)}
                        accessibilityLabel="10-digit mobile number"
                        aria-invalid={!!error}
                      />
                    </View>
                    <View style={s.helperRow}>
                      <MessageSquare size={14} color={T.success} />
                      <Text style={s.helperText}>We'll send a 6-digit verification code to your WhatsApp.</Text>
                    </View>
                  </View>
                  <PrimaryButton label="Send WhatsApp OTP" loading={isLoading} loadingText={loadingText} disabled={cleanPhone(phone).length !== 10} onPress={() => void sendOtp()} />
                </>
              ) : null}

              {step === 'otp' ? (
                <>
                  <View>
                    <Text style={s.fieldLabel}>6-DIGIT WHATSAPP CODE</Text>
                    <Pressable style={({ pressed }) => [s.otpRow, pressed && s.otpRowPressed]} onPress={() => otpInputRef.current?.focus()} accessibilityRole="button" accessibilityLabel={`One-time code, ${otp.length} of 6 digits entered`}>
                      {Array.from({ length: 6 }, (_, index) => (
                        <View key={index} style={[s.otpBox, index === otp.length && otp.length < 6 && s.otpBoxActive, !!error && s.inputError]}>
                          <Text style={s.otpDigit}>{otp[index] || ''}</Text>
                        </View>
                      ))}
                      <TextInput ref={otpInputRef} value={otp} onChangeText={updateOtp} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="sms-otp" maxLength={6} style={s.hiddenOtpInput} caretHidden autoFocus />
                    </Pressable>
                    <View style={s.otpActions}>
                      <Pressable onPress={changeNumber} style={({ pressed }) => [s.smallAction, pressed && s.pressed]} accessibilityRole="button">
                        <Text style={s.smallActionText}>← CHANGE NUMBER</Text>
                      </Pressable>
                      <Pressable onPress={() => void sendOtp()} disabled={resendTimer > 0 || isLoading} style={({ pressed }) => [s.smallAction, pressed && s.pressed]} accessibilityRole="button" accessibilityState={{ disabled: resendTimer > 0 || isLoading }}>
                        <RotateCcw size={12} color={resendTimer > 0 ? T.borderStrong : T.foreground} />
                        <Text style={[s.smallActionText, resendTimer > 0 && s.smallActionDisabled]}>{resendTimer > 0 ? `RESEND IN ${resendTimer}S` : 'RESEND OTP'}</Text>
                      </Pressable>
                    </View>
                  </View>
                  <PrimaryButton label="Verify & enter dashboard" loading={isLoading} loadingText={loadingText} disabled={otp.length !== 6} onPress={() => void verifyOtp()} />
                </>
              ) : null}

              {step === 'select_account' ? (
                <View style={s.accountList}>
                  <Text style={s.accountIntro}>Multiple accounts use this number. Select the account you want to open.</Text>
                  {accounts.map((account) => (
                    <Pressable key={account.adminId} style={({ pressed }) => [s.accountCard, pressed && s.accountCardPressed]} onPress={() => void chooseAccount(account)} disabled={isLoading} accessibilityRole="button" accessibilityState={{ disabled: isLoading, busy: isLoading }} accessibilityLabel={`Open ${account.instituteName} as ${account.teacherName}`}>
                      <View style={s.accountText}>
                        <View style={s.accountTitleRow}>
                          <Building2 size={20} color={T.primary} />
                          <Text style={s.accountTitle}>{account.instituteName}</Text>
                        </View>
                        <View style={s.accountDetailRow}>
                          <User size={14} color={T.mutedForeground} />
                          <Text style={s.accountDetail}>{account.teacherName}</Text>
                          <Text style={s.accountBullet}>•</Text>
                          <Text style={s.accountDetail}>{account.role.replace(/_/g, ' ')}</Text>
                        </View>
                      </View>
                      {isLoading ? <ActivityIndicator color={T.primary} /> : <ArrowRight size={20} color={T.borderStrong} />}
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>

        <View style={s.cornerLeft}><Text style={s.cornerLeftText}>v2.0 • System Active</Text></View>
        <View style={s.cornerRight}><View style={s.cornerLine1} /><View style={s.cornerLine2} /><Text style={s.cornerRightText}>AES-256</Text></View>
      </SafeAreaView>
    </View>
  );
}

function PrimaryButton({ label, loading, loadingText, disabled, onPress }: { label: string; loading: boolean; loadingText: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityLabel={label} style={({ pressed }) => [s.loginBtn, pressed && s.loginBtnPressed, (disabled || loading) && s.loginBtnDisabled]} onPress={onPress} disabled={disabled || loading} accessibilityRole="button" accessibilityState={{ disabled: disabled || loading, busy: loading }}>
      {loading ? (
        <View style={s.loadingWrap}><ActivityIndicator color={T.primaryForeground} size="small" /><Text accessibilityLiveRegion="polite" style={s.loadingText}>{loadingText}</Text></View>
      ) : (
        <><Text style={s.loginBtnText}>{label}</Text><ArrowRight size={20} color={T.primaryForeground} style={s.loginBtnIcon} /></>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.background },
  safeArea: { flex: 1 },
  scanHorizontal: { position: 'absolute', left: 0, width: '100%', height: StyleSheet.hairlineWidth, backgroundColor: T.scanStrong },
  scanVertical: { position: 'absolute', top: 0, height: '100%', width: StyleSheet.hairlineWidth, backgroundColor: T.scanSubtle },
  bgShape1: { position: 'absolute', top: -160, right: -160, width: 384, height: 384, borderRadius: 192, borderWidth: StyleSheet.hairlineWidth, borderColor: T.decorativeBorder },
  bgShape2: { position: 'absolute', bottom: -240, left: -80, width: 600, height: 600, borderRadius: 300, borderWidth: StyleSheet.hairlineWidth, borderColor: T.decorativeBorder },
  topBar: { minHeight: TouchTarget.comfortable, paddingHorizontal: Spacing['2xl'], paddingTop: Spacing.md, zIndex: 10 },
  backBtn: { minHeight: TouchTarget.minimum, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, alignSelf: 'flex-start' },
  backText: { ...TypeScale.caption, fontWeight: FontWeight.bold, letterSpacing: 2, color: T.mutedForeground },
  pressed: { opacity: T.pressedOpacity },
  keyboardView: { flex: 1, zIndex: 10 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: Spacing['2xl'], paddingTop: Spacing['2xl'], paddingBottom: Spacing['6xl'] * 2 },
  // The oversized wordmark is a deliberate brand treatment, not body typography.
  title: { fontSize: Math.min(width * 0.14, FontSize['4xl'] + Spacing.lg), fontWeight: FontWeight.black, letterSpacing: -2.2, color: T.primary, marginBottom: Spacing.xl },
  subtitle: { ...TypeScale.body, maxWidth: 500, color: T.mutedForeground, marginBottom: Spacing['3xl'] },
  errorBox: { backgroundColor: T.primary, padding: Spacing.lg, marginBottom: Spacing['2xl'], flexDirection: 'row', alignItems: 'flex-start', overflow: 'hidden' },
  errorLine: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, backgroundColor: T.destructive },
  errorIcon: { marginRight: Spacing.md, marginTop: StyleSheet.hairlineWidth },
  errorText: { ...TypeScale.label, color: T.primaryForeground, flex: 1 },
  formArea: { gap: Spacing['3xl'] },
  fieldLabel: { ...TypeScale.caption, marginBottom: Spacing.lg, fontWeight: FontWeight.extrabold, letterSpacing: 2, color: T.mutedForeground },
  phoneRow: { minHeight: Spacing['6xl'], flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: T.border },
  phoneRowFocused: { borderBottomWidth: 2, borderBottomColor: T.focus },
  inputError: { borderBottomWidth: 2, borderBottomColor: T.destructive },
  phonePrefix: { marginRight: Spacing.lg, fontSize: FontSize['2xl'], fontWeight: FontWeight.semibold, color: T.mutedForeground },
  phoneInput: { flex: 1, minWidth: 0, paddingVertical: Spacing.sm, fontSize: FontSize['2xl'], fontWeight: FontWeight.semibold, letterSpacing: 3, color: T.primary },
  helperRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md },
  helperText: { ...TypeScale.caption, flex: 1, color: T.mutedForeground },
  otpRow: { position: 'relative', flexDirection: 'row', gap: Spacing.sm },
  otpRowPressed: { opacity: T.pressedOpacity },
  otpBox: { flex: 1, minWidth: 0, height: Spacing['6xl'], alignItems: 'center', justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: T.border },
  otpBoxActive: { borderBottomWidth: 2, borderBottomColor: T.focus },
  otpDigit: { fontSize: FontSize['3xl'], fontWeight: FontWeight.black, color: T.primary },
  hiddenOtpInput: { position: 'absolute', width: StyleSheet.hairlineWidth, height: StyleSheet.hairlineWidth, opacity: 0 },
  otpActions: { marginTop: Spacing.xl, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.md },
  smallAction: { minHeight: TouchTarget.minimum, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  smallActionText: { ...TypeScale.caption, fontWeight: FontWeight.extrabold, letterSpacing: 1.2, color: T.foreground },
  smallActionDisabled: { color: T.borderStrong },
  loginBtn: { minHeight: Spacing['6xl'], paddingHorizontal: Spacing['2xl'], backgroundColor: T.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: Spacing.md },
  loginBtnPressed: { opacity: T.pressedOpacity },
  loginBtnDisabled: { opacity: T.disabledOpacity },
  loginBtnText: { paddingHorizontal: Spacing['2xl'], color: T.primaryForeground, fontSize: FontSize.sm, fontWeight: FontWeight.black, letterSpacing: 1.8, textAlign: 'center' },
  loginBtnIcon: { position: 'absolute', right: Spacing.xl },
  loadingWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  loadingText: { ...TypeScale.caption, color: T.primaryForeground, fontWeight: FontWeight.bold, letterSpacing: 1.6, textTransform: 'uppercase' },
  accountList: { gap: Spacing.md },
  accountIntro: { ...TypeScale.label, marginBottom: Spacing.xs, color: T.mutedForeground },
  accountCard: { minHeight: 88, padding: Spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: T.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md, backgroundColor: T.accountSurface },
  accountCardPressed: { backgroundColor: T.accountPressed },
  accountText: { flex: 1 },
  accountTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  accountTitle: { ...TypeScale.sectionTitle, flex: 1, fontWeight: FontWeight.extrabold, color: T.primary },
  accountDetailRow: { marginLeft: Spacing['2xl'], flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  accountDetail: { ...TypeScale.caption, color: T.mutedForeground, textTransform: 'capitalize' },
  accountBullet: { ...TypeScale.caption, color: T.borderStrong },
  cornerLeft: { position: 'absolute', bottom: TouchTarget.minimum, left: -30, transform: [{ rotate: '-90deg' }] },
  cornerLeftText: { ...TypeScale.caption, fontWeight: FontWeight.bold, letterSpacing: 1.8, color: T.mutedForeground, textTransform: 'uppercase' },
  cornerRight: { position: 'absolute', bottom: Spacing['4xl'], right: Spacing['2xl'], alignItems: 'flex-end', gap: Spacing.sm },
  cornerLine1: { height: Spacing.xs, width: TouchTarget.minimum, backgroundColor: T.primary },
  cornerLine2: { height: Spacing.xs, width: Spacing['3xl'], backgroundColor: T.borderStrong },
  cornerRightText: { ...TypeScale.caption, marginTop: Spacing.sm, fontWeight: FontWeight.bold, letterSpacing: 1.8, color: T.mutedForeground },
});
