import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet,
  KeyboardAvoidingView, Platform, TouchableWithoutFeedback,
  Keyboard, TouchableOpacity, Dimensions, ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp, withRepeat, withTiming, useSharedValue, useAnimatedStyle, Easing } from 'react-native-reanimated';
import { ArrowLeft, ArrowRight, AlertCircle } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import * as Haptics from 'expo-haptics';

const { width, height } = Dimensions.get('window');

const T = {
  bg: '#FDFDFD',
  black: '#000000',
  white: '#FFFFFF',
  text: '#171717',
  textMuted: '#9CA3AF',
  border: '#E5E7EB',
  danger: '#EF4444'
};

const AnimatedBackground = () => {
  const rotation1 = useSharedValue(0);
  const rotation2 = useSharedValue(0);
  const translateY = useSharedValue(-height * 0.1);
  const translateX = useSharedValue(-width * 0.1);

  useEffect(() => {
    rotation1.value = withRepeat(withTiming(360, { duration: 60000, easing: Easing.linear }), -1);
    rotation2.value = withRepeat(withTiming(-360, { duration: 80000, easing: Easing.linear }), -1);
    translateY.value = withRepeat(withTiming(height * 1.1, { duration: 8000, easing: Easing.linear }), -1);
    translateX.value = withRepeat(withTiming(width * 1.1, { duration: 12000, easing: Easing.linear }), -1);
  }, []);

  const shape1Style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation1.value}deg` }] }));
  const shape2Style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation2.value}deg` }] }));
  const scanHStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const scanVStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Horizontal Scanning Line */}
      <Animated.View style={[{ position: 'absolute', left: 0, width: '100%', height: 1, backgroundColor: 'rgba(0,0,0,0.1)' }, scanHStyle]} />
      
      {/* Vertical Scanning Line */}
      <Animated.View style={[{ position: 'absolute', top: 0, height: '100%', width: 1, backgroundColor: 'rgba(0,0,0,0.05)' }, scanVStyle]} />

      {/* Accent Shapes */}
      <Animated.View style={[s.bgShape1, shape1Style]} />
      <Animated.View style={[s.bgShape2, shape2Style]} />
    </View>
  );
};

export default function LoginScreen() {
  const router = useRouter();
  const { loginWithPassword } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (identifier.trim().length < 3 || password.length < 4) {
      setError('Please enter valid credentials.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    
    Keyboard.dismiss();
    setIsLoading(true);
    setError('');
    setLoadingText('Authenticating...');

    try {
      await loginWithPassword(identifier.trim(), password);
      setLoadingText('Verifying Security...');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => {
        setLoadingText('Loading Dashboard...');
        setTimeout(() => {
          router.replace('/(tabs)');
        }, 600);
      }, 600);
    } catch (err: any) {
      console.error('Login Error:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(err.message || 'Login failed.');
      setIsLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={s.container}>
        <AnimatedBackground />

        <SafeAreaView style={s.safeArea}>
          <View style={s.topBar}>
            {router.canGoBack() && (
              <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
                <ArrowLeft size={16} color={T.textMuted} strokeWidth={3} />
                <Text style={s.backText}>RETURN</Text>
              </TouchableOpacity>
            )}
          </View>

          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.kbView}>
            <Animated.View entering={FadeInDown.duration(1000).springify()}>
              <Text style={s.title}>MathLogs.</Text>
              <Text style={s.subtitle}>
                Enter your credentials to access the secure administration gateway.
              </Text>
            </Animated.View>

            {error ? (
              <Animated.View entering={FadeInDown.duration(400)} style={s.errorBox}>
                <View style={s.errorLine} />
                <AlertCircle size={20} color={T.danger} style={s.errorIcon} />
                <Text style={s.errorText}>{error}</Text>
              </Animated.View>
            ) : null}

            <Animated.View entering={FadeInUp.duration(800).delay(100)} style={s.formArea}>
              <View style={s.inputWrap}>
                <Text style={[s.inputLabel, identifier ? s.inputLabelActive : null]}>Email or Mobile</Text>
                <TextInput
                  style={s.input}
                  value={identifier}
                  onChangeText={(t) => { setIdentifier(t); setError(''); }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={s.inputWrap}>
                <Text style={[s.inputLabel, password ? s.inputLabelActive : null]}>Password</Text>
                <TextInput
                  style={s.input}
                  value={password}
                  onChangeText={(t) => { setPassword(t); setError(''); }}
                  secureTextEntry
                />
              </View>

              <TouchableOpacity
                style={[s.loginBtn, (!identifier || !password) && s.loginBtnDisabled]}
                onPress={handleLogin}
                disabled={isLoading || !identifier || !password}
                activeOpacity={0.8}
              >
                {isLoading ? (
                  <View style={s.loadingWrap}>
                    <ActivityIndicator color={T.white} size="small" />
                    <Text style={s.loadingText}>{loadingText}</Text>
                  </View>
                ) : (
                  <>
                    <Text style={s.loginBtnText}>ACCESS GATEWAY</Text>
                    <ArrowRight size={20} color={T.white} style={s.loginBtnIcon} />
                  </>
                )}
              </TouchableOpacity>
            </Animated.View>
          </KeyboardAvoidingView>

          {/* Brutalist Corner Decorations */}
          <View style={s.cornerLeft}>
            <Text style={s.cornerLeftText}>v2.0 • System Active</Text>
          </View>
          <View style={s.cornerRight}>
            <View style={s.cornerLine1} />
            <View style={s.cornerLine2} />
            <Text style={s.cornerRightText}>AES-256</Text>
          </View>

        </SafeAreaView>
      </View>
    </TouchableWithoutFeedback>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  safeArea: { flex: 1 },
  bgShape1: {
    position: 'absolute', top: -160, right: -160, width: 384, height: 384,
    borderRadius: 192, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)'
  },
  bgShape2: {
    position: 'absolute', bottom: -240, left: -80, width: 600, height: 600,
    borderRadius: 300, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)'
  },
  topBar: { paddingHorizontal: 32, paddingTop: 16, zIndex: 10 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backText: { fontSize: 12, fontWeight: '700', letterSpacing: 2, color: T.textMuted },
  
  kbView: { flex: 1, justifyContent: 'center', paddingHorizontal: 32, zIndex: 10 },
  title: { fontSize: 56, fontWeight: '900', letterSpacing: -2, color: T.black, marginBottom: 24 },
  subtitle: { fontSize: 18, fontWeight: '500', color: T.textMuted, marginBottom: 40, lineHeight: 26 },

  errorBox: {
    backgroundColor: T.black, padding: 20, marginBottom: 32, flexDirection: 'row', alignItems: 'flex-start', overflow: 'hidden'
  },
  errorLine: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, backgroundColor: T.danger },
  errorIcon: { marginRight: 12, marginTop: 2 },
  errorText: { color: T.white, fontSize: 14, fontWeight: '500', lineHeight: 20, flex: 1 },

  formArea: { gap: 32 },
  inputWrap: { borderBottomWidth: 2, borderBottomColor: T.border, paddingTop: 16, position: 'relative' },
  inputLabel: {
    position: 'absolute', top: 24, left: 0, fontSize: 24, fontWeight: '500', color: '#D1D5DB'
  },
  inputLabelActive: {
    top: -4, fontSize: 12, fontWeight: '700', letterSpacing: 2, color: T.black, textTransform: 'uppercase'
  },
  input: {
    height: 48, fontSize: 24, fontWeight: '500', color: T.black, paddingBottom: 8, paddingHorizontal: 0
  },

  loginBtn: {
    backgroundColor: T.black, height: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: 16
  },
  loginBtnDisabled: { backgroundColor: '#171717' },
  loginBtnText: { color: T.white, fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  loginBtnIcon: { position: 'absolute', right: 24 },
  loadingWrap: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  loadingText: { color: 'rgba(255,255,255,0.9)', fontSize: 10, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' },

  cornerLeft: { position: 'absolute', bottom: 48, left: -32, transform: [{ rotate: '-90deg' }] },
  cornerLeftText: { fontSize: 10, fontWeight: '700', letterSpacing: 2, color: T.textMuted, textTransform: 'uppercase' },
  
  cornerRight: { position: 'absolute', bottom: 48, right: 32, alignItems: 'flex-end', gap: 8 },
  cornerLine1: { height: 6, width: 48, backgroundColor: T.black },
  cornerLine2: { height: 6, width: 32, backgroundColor: '#D1D5DB' },
  cornerRightText: { fontSize: 10, fontWeight: '700', letterSpacing: 2, color: T.textMuted, marginTop: 8 }
});
