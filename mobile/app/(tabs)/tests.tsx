import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, FlatList, StyleSheet, TextInput,
  RefreshControl, Dimensions, Platform, TouchableOpacity, Alert,
  Modal, ScrollView, KeyboardAvoidingView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SkeletonLoader } from '../../components/ui';
import { Search, FileText, Calendar, ChevronRight, BarChart2, Plus, X, CheckSquare, Square } from 'lucide-react-native';
import api from '../../services/api';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');

const T = {
  bg: '#F5F5F7', white: '#FFFFFF', text: '#1D1D1F',
  textSec: '#86868B', textMuted: '#AEAEB2', accent: '#111827',
  emerald: '#10b981', amber: '#f59e0b', red: '#ef4444',
  border: 'rgba(0,0,0,0.06)', shadow: 'rgba(0,0,0,0.06)',
};

interface Test {
  id: string;
  name: string;
  subject: string;
  className: string | null;
  date: string;
  maxMarks: number;
  _count: { marks: number };
}

interface Batch {
  id: string;
  name: string;
  className: string | null;
  subject: string | null;
}

function getTestStatus(test: Test): { color: string; label: string } {
  const testDate = new Date(test.date);
  const now = new Date();

  if (testDate > now) return { color: T.amber, label: 'Upcoming' };
  if (test._count.marks > 0) return { color: T.emerald, label: 'Graded' };
  return { color: T.accent, label: 'Pending' };
}

function TestCard({ item, index }: { item: Test; index: number }) {
  const st = getTestStatus(item);
  const router = useRouter();
  const dateStr = new Date(item.date).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  return (
    <Animated.View entering={FadeInRight.duration(400).delay(index * 50)}>
      <TouchableOpacity activeOpacity={0.7} style={s.card} onPress={() => router.push(`/test/${item.id}`)}>
        <View style={[s.testIcon, { backgroundColor: `${st.color}12` }]}>
          <FileText size={20} color={st.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.testName} numberOfLines={1}>{item.name}</Text>
          <View style={s.testMeta}>
            <Calendar size={12} color={T.textSec} />
            <Text style={s.testDate}>{dateStr}</Text>
            {item._count.marks > 0 && (
              <>
                <BarChart2 size={12} color={T.textSec} style={{ marginLeft: 10 }} />
                <Text style={s.testDate}>{item._count.marks} graded</Text>
              </>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <Text style={[s.testDate, { color: T.textMuted }]}>{item.subject}</Text>
            {item.className && <Text style={[s.testDate, { color: T.textMuted }]}>• {item.className}</Text>}
            <Text style={[s.testDate, { color: T.textMuted }]}>• Max: {item.maxMarks}</Text>
          </View>
        </View>
        <View style={[s.statusPill, { backgroundColor: `${st.color}12` }]}>
          <Text style={[s.statusText, { color: st.color }]}>{st.label}</Text>
        </View>
        <ChevronRight size={18} color={T.textMuted} style={{ marginLeft: 8 }} />
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function TestsScreen() {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [maxMarks, setMaxMarks] = useState('');

  const { data: tests, isLoading, refetch, isRefetching } = useQuery<Test[]>({
    queryKey: ['tests'],
    queryFn: async () => {
      const res = await api.get('/tests');
      return res.data;
    },
  });

  const { data: batches = [] } = useQuery<Batch[]>({
    queryKey: ['batches'],
    queryFn: async () => {
      const res = await api.get('/batches');
      return res.data;
    },
  });

  const filtered = useMemo(() => {
    if (!tests) return [];
    if (!search) return tests;
    const q = search.toLowerCase();
    return tests.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.subject.toLowerCase().includes(q)
    );
  }, [tests, search]);

  const upcomingCount = useMemo(() =>
    (tests || []).filter(t => new Date(t.date) > new Date()).length, [tests]);
  const gradedCount = useMemo(() =>
    (tests || []).filter(t => t._count.marks > 0).length, [tests]);
  const pendingCount = useMemo(() =>
    (tests || []).filter(t => new Date(t.date) <= new Date() && t._count.marks === 0).length, [tests]);

  const handleCreate = async () => {
    if (!name || selectedBatchIds.length === 0 || !date || !maxMarks) {
      Alert.alert('Missing Fields', 'Please fill in all required fields and select at least one batch.');
      return;
    }

    const batch = batches.find(b => b.id === selectedBatchIds[0]);
    const subject = batch?.subject || 'General';
    const className = batch?.className;

    try {
      await api.post('/tests', {
        name,
        subject,
        date,
        maxMarks: parseFloat(maxMarks),
        className,
        batchIds: selectedBatchIds
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowForm(false);
      setName(''); setSelectedBatchIds([]); setMaxMarks('');
      refetch();
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to create test');
    }
  };

  const toggleBatch = (id: string) => {
    setSelectedBatchIds(prev => 
      prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]
    );
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <Animated.View entering={FadeInDown.duration(400)} style={s.headerArea}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <Text style={s.title}>Tests</Text>
            <Text style={s.subtitle}>{tests?.length ?? 0} total tests</Text>
          </View>
          <TouchableOpacity style={s.createBtn} onPress={() => setShowForm(true)}>
            <Plus size={16} color={T.white} />
            <Text style={s.createBtnText}>New Test</Text>
          </TouchableOpacity>
        </View>
        <View style={s.searchWrap}>
          <Search size={18} color={T.textMuted} />
          <TextInput
            placeholder="Search tests..."
            placeholderTextColor={T.textMuted}
            value={search} onChangeText={setSearch}
            style={s.searchInput}
          />
        </View>
      </Animated.View>

      {/* Stats Row */}
      {!isLoading && (
        <Animated.View entering={FadeInDown.duration(400).delay(150)} style={s.statsRow}>
          <View style={s.miniStat}>
            <Text style={[s.miniValue, { color: T.amber }]}>{upcomingCount}</Text>
            <Text style={s.miniLabel}>Upcoming</Text>
          </View>
          <View style={s.miniStat}>
            <Text style={[s.miniValue, { color: T.accent }]}>{pendingCount}</Text>
            <Text style={s.miniLabel}>Pending</Text>
          </View>
          <View style={s.miniStat}>
            <Text style={[s.miniValue, { color: T.emerald }]}>{gradedCount}</Text>
            <Text style={s.miniLabel}>Graded</Text>
          </View>
        </Animated.View>
      )}

      <FlatList
        data={filtered}
        renderItem={({ item, index }) => <TestCard item={item} index={index} />}
        keyExtractor={item => item.id}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={T.accent} />}
        ListEmptyComponent={
          isLoading ? (
            <View style={{ gap: 12 }}>
              {[1, 2, 3].map(i => <SkeletonLoader key={i} width={width - 48} height={90} borderRadius={16} />)}
            </View>
          ) : (
            <View style={s.empty}>
              <FileText size={48} color={T.textMuted} />
              <Text style={s.emptyTitle}>No tests yet</Text>
              <Text style={s.emptyDesc}>Create your first test using the button above.</Text>
            </View>
          )
        }
      />

      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowForm(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Create New Test</Text>
            <TouchableOpacity onPress={() => setShowForm(false)} style={s.closeBtn}>
              <X size={20} color={T.textSec} />
            </TouchableOpacity>
          </View>
          
          <ScrollView contentContainerStyle={s.modalContent} showsVerticalScrollIndicator={false}>
            <View style={s.inputGroup}>
              <Text style={s.label}>Test Name</Text>
              <View style={s.inputWrap}>
                <FileText size={18} color={T.textMuted} style={s.inputIcon} />
                <TextInput 
                  style={s.input} 
                  placeholder="e.g. Unit Test 1" 
                  value={name} 
                  onChangeText={setName} 
                />
              </View>
            </View>

            <View style={s.inputGroup}>
              <Text style={s.label}>Select Batches</Text>
              <View style={s.batchesContainer}>
                {batches.map(batch => {
                  const isSelected = selectedBatchIds.includes(batch.id);
                  return (
                    <TouchableOpacity 
                      key={batch.id} 
                      style={[s.batchOption, isSelected && s.batchOptionSelected]}
                      onPress={() => toggleBatch(batch.id)}
                      activeOpacity={0.7}
                    >
                      {isSelected ? (
                        <CheckSquare size={20} color={T.accent} />
                      ) : (
                        <Square size={20} color={T.textMuted} />
                      )}
                      <Text style={[s.batchOptionText, isSelected && s.batchOptionTextSelected]}>
                        {batch.name} {batch.className ? `(${batch.className})` : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={s.inputGroup}>
              <Text style={s.label}>Date (YYYY-MM-DD)</Text>
              <View style={s.inputWrap}>
                <Calendar size={18} color={T.textMuted} style={s.inputIcon} />
                <TextInput 
                  style={s.input} 
                  placeholder="2026-05-17" 
                  value={date} 
                  onChangeText={setDate} 
                />
              </View>
            </View>

            <View style={s.inputGroup}>
              <Text style={s.label}>Max Marks</Text>
              <View style={s.inputWrap}>
                <BarChart2 size={18} color={T.textMuted} style={s.inputIcon} />
                <TextInput 
                  style={s.input} 
                  placeholder="e.g. 50" 
                  keyboardType="numeric"
                  value={maxMarks} 
                  onChangeText={setMaxMarks} 
                />
              </View>
            </View>

            <TouchableOpacity style={s.submitBtn} onPress={handleCreate}>
              <Text style={s.submitBtnText}>Create Test</Text>
              <ChevronRight size={18} color={T.white} />
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  headerArea: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 },
  title: { color: T.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
  subtitle: { color: T.textSec, fontSize: 14, fontWeight: '500', marginTop: 4, marginBottom: 16 },
  createBtn: {
    backgroundColor: T.accent, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  createBtnText: { color: T.white, fontWeight: '600', fontSize: 13 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: T.white,
    borderRadius: 14, paddingHorizontal: 14, height: 46,
    borderWidth: 1, borderColor: T.border,
  },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 15, color: T.text, fontWeight: '500' },
  statsRow: { flexDirection: 'row', paddingHorizontal: 24, gap: 10, marginBottom: 8 },
  miniStat: {
    flex: 1, backgroundColor: T.white, borderRadius: 14, padding: 14,
    alignItems: 'center', borderWidth: 1, borderColor: T.border,
    ...Platform.select({
      ios: { shadowColor: T.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6 },
      android: { elevation: 1 },
    }),
  },
  miniValue: { fontSize: 22, fontWeight: '700' },
  miniLabel: { color: T.textSec, fontSize: 11, fontWeight: '600', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  listContent: { padding: 24, paddingTop: 12, paddingBottom: 120 },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: T.white,
    borderRadius: 16, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: T.border,
    ...Platform.select({
      ios: { shadowColor: T.shadow, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 1, shadowRadius: 10 },
      android: { elevation: 2 },
    }),
  },
  testIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  testName: { color: T.text, fontSize: 16, fontWeight: '600', marginBottom: 4 },
  testMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  testDate: { color: T.textSec, fontSize: 12 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyTitle: { color: T.text, fontSize: 18, fontWeight: '600', marginTop: 16 },
  emptyDesc: { color: T.textSec, fontSize: 14, marginTop: 6, textAlign: 'center' },
  
  modalContainer: { flex: 1, backgroundColor: T.bg },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, paddingVertical: 20, backgroundColor: T.white,
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: T.text },
  closeBtn: { padding: 4, backgroundColor: T.bg, borderRadius: 999 },
  modalContent: { padding: 24, gap: 20 },
  inputGroup: { gap: 8 },
  label: { fontSize: 12, fontWeight: '700', color: T.textSec, textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: 4 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: T.white,
    borderWidth: 1, borderColor: T.border, borderRadius: 16, paddingHorizontal: 16, height: 56,
  },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, fontSize: 16, color: T.text, fontWeight: '500' },
  batchesContainer: {
    backgroundColor: T.white, borderWidth: 1, borderColor: T.border, borderRadius: 16,
    padding: 8, gap: 4, maxHeight: 200,
  },
  batchOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
    borderRadius: 12, backgroundColor: T.bg,
  },
  batchOptionSelected: { backgroundColor: `${T.accent}08` },
  batchOptionText: { fontSize: 15, color: T.textSec, fontWeight: '500' },
  batchOptionTextSelected: { color: T.accent, fontWeight: '600' },
  submitBtn: {
    backgroundColor: T.accent, height: 56, borderRadius: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 12, shadowColor: T.shadow, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1, shadowRadius: 12, elevation: 4, marginBottom: 40,
  },
  submitBtnText: { color: T.white, fontSize: 16, fontWeight: '700' },
});
