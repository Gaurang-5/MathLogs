import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet,
  KeyboardAvoidingView, Platform, TouchableWithoutFeedback,
  Keyboard, Alert, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { User, Lock, ArrowRight, ShieldCheck, AlertOctagon } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import * as Haptics from 'expo-haptics';

const T = {
  bg: '#F5F5F7', white: '#FFFFFF', text: '#1D1D1F',
  textSec: '#86868B', textMuted: '#AEAEB2', accent: '#111827',
  border: 'rgba(0,0,0,0.08)', danger: '#ef4444',
};

export default function LoginScreen() {
  const router = useRouter();
  const { loginWithPassword } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (identifier.trim().length < 3) {
      setError('Please enter a valid email or mobile number.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    if (password.length < 4) {
      setError('Please enter your password.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    
    Keyboard.dismiss();
    setIsLoading(true);
    setError('');

    try {
      await loginWithPassword(identifier.trim(), password);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)');
    } catch (err: any) {
      console.error('Login Error:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={s.container}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.kbView}>
          <View style={s.headerArea}>
            <Animated.View entering={FadeInDown.duration(600).delay(100)}>
              <View style={s.shieldIconWrap}>
                <ShieldCheck size={32} color={T.text} strokeWidth={1.5} />
              </View>
            </Animated.View>
            <Animated.View entering={FadeInDown.duration(600).delay(200)}>
              <Text style={s.title}>MathLogs</Text>
            </Animated.View>
            <Animated.View entering={FadeInDown.duration(600).delay(300)}>
              <Text style={s.subtitle}>Secure Authentication Gateway</Text>
            </Animated.View>
          </View>

          <Animated.View entering={FadeInUp.duration(500).delay(400)} style={s.formArea}>
            {error ? (
              <View style={s.errorBox}>
                <AlertOctagon size={20} color={T.danger} style={{ marginRight: 8, marginTop: 2 }} />
                <Text style={s.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={s.inputGroup}>
              <Text style={s.inputLabel}>EMAIL OR MOBILE</Text>
              <View style={s.inputWrap}>
                <User size={20} color={T.textMuted} style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  placeholder="Enter your email or phone number"
                  placeholderTextColor={T.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={identifier}
                  onChangeText={(t) => { setIdentifier(t); setError(''); }}
                />
              </View>
            </View>

            <View style={s.inputGroup}>
              <Text style={s.inputLabel}>PASSWORD</Text>
              <View style={s.inputWrap}>
                <Lock size={20} color={T.textMuted} style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  placeholder="••••••••"
                  placeholderTextColor={T.textMuted}
                  secureTextEntry
                  value={password}
                  onChangeText={(t) => { setPassword(t); setError(''); }}
                />
              </View>
            </View>

            <TouchableWithoutFeedback onPress={isLoading ? undefined : handleLogin}>
              <View style={[s.loginBtn, isLoading && s.loginBtnDisabled]}>
                <Text style={s.loginBtnText}>
                  {isLoading ? 'Authenticating...' : 'Access Dashboard'}
                </Text>
                {!isLoading && <ArrowRight size={20} color={T.white} style={{ marginLeft: 8 }} />}
              </View>
            </TouchableWithoutFeedback>
          </Animated.View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  kbView: { flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
  headerArea: { alignItems: 'center', marginBottom: 40 },
  shieldIconWrap: {
    width: 64, height: 64, borderRadius: 24,
    borderWidth: 1.5, borderColor: T.text,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 24,
  },
  title: { color: T.text, fontSize: 32, fontWeight: '700', letterSpacing: -0.5, marginBottom: 8 },
  subtitle: { color: T.textSec, fontSize: 14, textAlign: 'center' },
  
  formArea: { gap: 20 },
  
  errorBox: {
    flexDirection: 'row', backgroundColor: `${T.danger}15`,
    borderColor: `${T.danger}30`, borderWidth: 1, padding: 16,
    borderRadius: 16, marginBottom: 8, alignItems: 'flex-start'
  },
  errorText: { color: T.danger, fontSize: 13, flex: 1, lineHeight: 18 },

  inputGroup: { gap: 8 },
  inputLabel: { fontSize: 11, fontWeight: '700', color: T.textSec, letterSpacing: 1, marginLeft: 4 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', height: 56,
    borderWidth: 1.5, borderColor: T.border, borderRadius: 16,
    paddingHorizontal: 16, backgroundColor: T.white,
  },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, color: T.text, fontSize: 16, fontWeight: '500', height: '100%' },
  
  loginBtn: {
    backgroundColor: T.text, height: 56, borderRadius: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: 8,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
      android: { elevation: 4 },
    }),
  },
  loginBtnDisabled: { opacity: 0.7 },
  loginBtnText: { color: T.white, fontSize: 16, fontWeight: '700' },
});
