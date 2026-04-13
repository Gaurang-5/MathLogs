import React, { useState, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, TextInput,
  Dimensions, Platform, TouchableOpacity, Alert,
  KeyboardAvoidingView, Keyboard, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeIn, FadeOut } from 'react-native-reanimated';
import { Search, Zap, CheckCircle2, User as UserIcon } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { BrandButton } from '../../components/ui';

const { width } = Dimensions.get('window');

const T = {
  bg: '#F5F5F7', white: '#FFFFFF', text: '#1D1D1F',
  textSec: '#86868B', textMuted: '#AEAEB2', accent: '#f59e0b',
  emerald: '#10b981', border: 'rgba(0,0,0,0.06)', shadow: 'rgba(0,0,0,0.06)',
};

interface StudentResult {
  id: string;
  name: string;
  humanId: string | null;
  phone: string | null;
  batchName: string;
  totalFee: number;
  totalPaid: number;
  balance: number;
}

export default function QuickFeeScreen() {
  const [search, setSearch] = useState('');
  const [student, setStudent] = useState<StudentResult | null>(null);
  const [amount, setAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const amountRef = useRef<TextInput>(null);

  const { data: students = [], refetch } = useQuery<StudentResult[]>({
    queryKey: ['quick-search-fees'],
    queryFn: async () => {
      const res = await api.get('/fees');
      return res.data;
    },
  });

  const searchResults = useMemo(() => {
    if (search.length < 2) return [];
    const lowerSearch = search.toLowerCase();
    return students.filter(s => 
      s.name.toLowerCase().includes(lowerSearch) || 
      (s.humanId && s.humanId.toLowerCase().includes(lowerSearch)) ||
      (s.phone && s.phone.includes(search.trim()))
    ).slice(0, 5); // top 5 results
  }, [search, students]);

  const selectStudent = (s: StudentResult) => {
    Keyboard.dismiss();
    setSearch('');
    setStudent(s);
    setAmount(s.balance > 0 ? s.balance.toString() : '');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => amountRef.current?.focus(), 100);
  };

  const handlePayment = async () => {
    const numericAmount = parseFloat(amount);
    if (!amount || isNaN(numericAmount) || numericAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post('/fees/pay', {
        studentId: student?.id,
        amount: numericAmount,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccess(true);
      refetch();
      Keyboard.dismiss();
      setTimeout(() => {
        setStudent(null);
        setSearch('');
        setAmount('');
        setSuccess(false);
      }, 3000);
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Payment Failed', e.response?.data?.error || 'Could not record payment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView 
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 120 }} 
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Animated.View entering={FadeInDown.duration(400)} style={s.headerArea}>
          <View style={s.iconWrap}><Zap size={32} color={T.white} fill={T.white} /></View>
          <Text style={s.title}>Quick Fee</Text>
          <Text style={s.subtitle}>Search by name, ID, or phone to log payment</Text>
        </Animated.View>

        {!student && !success && (
          <Animated.View entering={FadeInDown.duration(400).delay(100)} style={s.searchSection}>
            <View style={s.searchBar}>
              <Search size={22} color={T.textMuted} />
              <TextInput
                style={s.searchInput}
                placeholder="Student Name, ID, or Phone..."
                placeholderTextColor={T.textMuted}
                value={search}
                onChangeText={setSearch}
                returnKeyType="search"
                autoCorrect={false}
              />
            </View>

            {search.length >= 2 && searchResults.length > 0 && (
              <ScrollView style={s.resultsContainer} keyboardShouldPersistTaps="handled">
                {searchResults.map((res, i) => (
                  <TouchableOpacity 
                    key={res.id} 
                    style={[s.resultItem, i < searchResults.length - 1 && s.resultItemBorder]}
                    onPress={() => selectStudent(res)}
                  >
                    <View style={s.resultAvatar}><UserIcon size={16} color={T.textMuted}/></View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.resultName}>{res.name}</Text>
                      <Text style={s.resultMeta}>{res.humanId} • {res.batchName}</Text>
                    </View>
                    {res.balance > 0 && <Text style={s.resultDue}>₹{res.balance}</Text>}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            
            {search.length >= 2 && searchResults.length === 0 && (
              <View style={s.noResults}>
                <Text style={s.noResultsText}>No students found</Text>
              </View>
            )}
          </Animated.View>
        )}

        {student && !success && (
          <Animated.View entering={FadeInDown.duration(300)} style={s.studentCard}>
            <TouchableOpacity 
              style={{ position: 'absolute', top: 16, right: 16, zIndex: 10, padding: 8 }} 
              onPress={() => setStudent(null)}
            >
              <Text style={{ color: T.textMuted, fontWeight: '700', fontSize: 13 }}>Cancel</Text>
            </TouchableOpacity>

            <View style={s.studentInfoRow}>
              <View style={s.avatar}><UserIcon size={24} color={T.accent} /></View>
              <View style={{ flex: 1, paddingRight: 40 }}>
                <Text style={s.studentName} numberOfLines={1}>{student.name}</Text>
                <Text style={s.studentBatch}>{student.batchName}</Text>
              </View>
            </View>

            <View style={s.balanceInfoRow}>
                <Text style={s.pendingBadgeLabel}>Outstanding Balance</Text>
                <Text style={[s.pendingBadgeAmount, student.balance > 0 ? { color: '#ef4444' } : { color: T.emerald }]}>
                  ₹{student.balance.toLocaleString()}
                </Text>
            </View>

            <View style={s.amountInputContainer}>
              <Text style={s.rupeeSymbol}>₹</Text>
              <TextInput
                ref={amountRef}
                style={s.amountInput}
                placeholder="0"
                placeholderTextColor={T.textMuted}
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
              />
            </View>

            <BrandButton
              title={`Confirm Payment`}
              onPress={handlePayment}
              loading={isSubmitting}
              style={{ marginTop: 20 }}
            />
          </Animated.View>
        )}

        {success && (
          <Animated.View entering={FadeIn.duration(400)} exiting={FadeOut} style={s.successCard}>
            <View style={s.successIconWrap}><CheckCircle2 size={40} color={T.emerald} /></View>
            <Text style={s.successTitle}>Payment Recorded!</Text>
            <Text style={s.successDesc}>₹{amount} collected from {student?.name}</Text>
          </Animated.View>
        )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  headerArea: { alignItems: 'center', paddingTop: 40, paddingBottom: 24 },
  iconWrap: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
    ...Platform.select({
      ios: { shadowColor: T.accent, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 12 },
      android: { elevation: 6 },
    }),
  },
  title: { color: T.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginBottom: 8 },
  subtitle: { color: T.textSec, fontSize: 15, fontWeight: '500' },
  searchSection: { paddingHorizontal: 20, zIndex: 10 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: T.white, borderRadius: 16,
    paddingHorizontal: 16, height: 56,
    borderWidth: 1, borderColor: T.border,
    ...Platform.select({
      ios: { shadowColor: T.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  searchInput: { flex: 1, marginLeft: 12, fontSize: 16, color: T.text, fontWeight: '600' },
  
  resultsContainer: {
    backgroundColor: T.white, borderRadius: 16, marginTop: 8,
    borderWidth: 1, borderColor: T.border, maxHeight: 240,
    ...Platform.select({
      ios: { shadowColor: T.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 12 },
    }),
  },
  resultItem: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  resultItemBorder: { borderBottomWidth: 1, borderBottomColor: T.border },
  resultAvatar: { width: 32, height: 32, borderRadius: 8, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  resultName: { fontSize: 15, fontWeight: '700', color: T.text, marginBottom: 2 },
  resultMeta: { fontSize: 12, color: T.textSec, fontWeight: '500' },
  resultDue: { fontSize: 14, fontWeight: '800', color: '#ef4444' },

  noResults: { marginTop: 12, alignItems: 'center', padding: 16 },
  noResultsText: { color: T.textMuted, fontSize: 14, fontWeight: '600' },

  studentCard: {
    margin: 20, padding: 24, paddingTop: 32,
    backgroundColor: T.white, borderRadius: 24,
    borderWidth: 1, borderColor: T.border,
    ...Platform.select({
      ios: { shadowColor: T.shadow, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 1, shadowRadius: 16 },
      android: { elevation: 4 },
    }),
  },
  studentInfoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  avatar: { width: 48, height: 48, borderRadius: 14, backgroundColor: `${T.accent}15`, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  studentName: { fontSize: 18, color: T.text, fontWeight: '800', marginBottom: 4 },
  studentBatch: { fontSize: 13, color: T.textSec, fontWeight: '600' },
  
  balanceInfoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderTopWidth: 1, borderTopColor: T.border, borderBottomWidth: 1, borderBottomColor: T.border, marginBottom: 20 },
  pendingBadgeLabel: { fontSize: 13, color: T.textSec, fontWeight: '600' },
  pendingBadgeAmount: { fontSize: 18, fontWeight: '800' },

  amountInputContainer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: T.bg, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 20,
    borderWidth: 1, borderColor: T.border,
  },
  rupeeSymbol: { fontSize: 32, color: T.text, fontWeight: '800', marginRight: 6 },
  amountInput: { fontSize: 40, color: T.text, fontWeight: '800', minWidth: 80, textAlign: 'center' },
  
  successCard: {
    margin: 24, padding: 40, alignItems: 'center',
    backgroundColor: T.white, borderRadius: 28,
    borderWidth: 1, borderColor: T.border,
  },
  successIconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: `${T.emerald}15`, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  successTitle: { fontSize: 24, color: T.text, fontWeight: '800', marginBottom: 12 },
  successDesc: { fontSize: 15, color: T.textSec, textAlign: 'center' },
});
