import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet,
  KeyboardAvoidingView, Platform, TouchableWithoutFeedback,
  Keyboard, Alert, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { BrandButton } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import * as Haptics from 'expo-haptics';

const T = {
  bg: '#F5F5F7', white: '#FFFFFF', text: '#1D1D1F',
  textSec: '#86868B', textMuted: '#AEAEB2', accent: '#0d7ff2',
  border: 'rgba(0,0,0,0.08)',
};

export default function LoginScreen() {
  const router = useRouter();
  const { sendOtp, verifyOtp } = useAuth();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSendOtp = async () => {
    if (phone.length < 5) { Alert.alert('Invalid Input', 'Please enter a valid mobile number or email.'); return; }
    Keyboard.dismiss();
    setIsLoading(true);
    try {
      await sendOtp(phone);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep('otp');
    } catch (error: any) {
      console.error('Send OTP Error:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', error.response?.data?.error || error.message || 'Failed to send OTP.');
    } finally { setIsLoading(false); }
  };

  const handleVerifyOtp = async () => {
    if (otp.length < 6) { Alert.alert('Invalid OTP', 'Please enter the 6-digit code.'); return; }
    Keyboard.dismiss();
    setIsLoading(true);
    try {
      await verifyOtp(phone, otp);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)');
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Verification Failed', error.response?.data?.error || 'Invalid OTP code.');
    } finally { setIsLoading(false); }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={s.container}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.kbView}>
          <View style={s.headerArea}>
            <Animated.View entering={FadeInDown.duration(600).delay(100)}>
              <Image source={require('../assets/images/icon.png')} style={s.logo} />
            </Animated.View>
            <Animated.View entering={FadeInDown.duration(600).delay(200)}>
              <Text style={s.title}>MathLogs</Text>
            </Animated.View>
            <Animated.View entering={FadeInDown.duration(600).delay(300)}>
              <Text style={s.subtitle}>
                {step === 'phone' ? 'Enter your mobile number or email to sign in' : 'Enter the 6-digit code sent to you'}
              </Text>
            </Animated.View>
          </View>

          <Animated.View entering={FadeInUp.duration(500).delay(400)} style={s.formArea}>
            {step === 'phone' ? (
              <View style={s.inputWrap}>
                <TextInput style={s.input} placeholder="Mobile Number or Email" placeholderTextColor={T.textMuted}
                  keyboardType="default" autoCapitalize="none" autoCorrect={false} value={phone} onChangeText={setPhone} autoFocus />
              </View>
            ) : (
              <View style={[s.inputWrap, { borderColor: `${T.accent}40` }]}>
                <TextInput style={[s.input, { textAlign: 'center', letterSpacing: 16, fontSize: 24, fontWeight: '700' }]}
                  placeholder="000000" placeholderTextColor={T.textMuted}
                  keyboardType="number-pad" maxLength={6} value={otp} onChangeText={setOtp} autoFocus />
              </View>
            )}
            <View style={{ marginTop: 8 }}>
              <BrandButton
                title={step === 'phone' ? 'Get OTP' : 'Verify & Login'}
                onPress={step === 'phone' ? handleSendOtp : handleVerifyOtp}
                loading={isLoading}
              />
            </View>
            {step === 'otp' && (
              <TouchableWithoutFeedback onPress={() => { setStep('phone'); setOtp(''); }}>
                <Text style={s.changeNum}>Change email / phone</Text>
              </TouchableWithoutFeedback>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  kbView: { flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
  headerArea: { alignItems: 'center', marginBottom: 48 },
  logo: { width: 80, height: 80, borderRadius: 18, marginBottom: 24 },
  title: { color: T.text, fontSize: 36, fontWeight: '700', letterSpacing: -0.5, marginBottom: 8 },
  subtitle: { color: T.textSec, fontSize: 16, textAlign: 'center' },
  formArea: { gap: 20 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', height: 56,
    borderWidth: 1, borderColor: T.border, borderRadius: 16,
    paddingHorizontal: 20, backgroundColor: T.white,
  },
  countryCode: { color: T.text, fontSize: 18, fontWeight: '500' },
  separator: { width: 1, height: 24, backgroundColor: T.border, marginHorizontal: 16 },
  input: { flex: 1, color: T.text, fontSize: 18, fontWeight: '500' },
  changeNum: { color: T.accent, textAlign: 'center', fontSize: 14, fontWeight: '600', marginTop: 16 },
});
