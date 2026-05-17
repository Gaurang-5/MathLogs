import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, FlatList, StyleSheet, TextInput,
  RefreshControl, Dimensions, Platform, TouchableOpacity, Alert,
  Modal, ScrollView, KeyboardAvoidingView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeInRight, FadeIn, FadeOut } from 'react-native-reanimated';
import { useQuery } from '@tanstack/react-query';
import { SkeletonLoader } from '../../components/ui';
import { Search, Users as UsersIcon, BookOpen, ChevronRight, Plus, Clock, ExternalLink, X, Type, GraduationCap, Hash } from 'lucide-react-native';
import api from '../../services/api';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');

const T = {
  bg: '#F5F5F7', white: '#FFFFFF', text: '#1D1D1F',
  textSec: '#86868B', textMuted: '#AEAEB2', accent: '#111827',
  teal: '#4B5563', emerald: '#10b981', amber: '#f59e0b', red: '#ef4444',
  border: 'rgba(0,0,0,0.06)', shadow: 'rgba(0,0,0,0.06)',
};

interface Batch {
  id: string;
  name: string;
  subject: string | null;
  className: string | null;
  timeSlot: string | null;
  feeAmount: number;
  isRegistrationOpen: boolean;
  _count: { students: number };
}

interface InstituteConfig {
  requiresGrades?: boolean;
  allowedClasses?: string[];
  subjects?: string[];
}

interface InstituteResponse {
  config?: InstituteConfig;
}

function BatchCard({ item, index }: { item: Batch; index: number }) {
  const router = useRouter();
  const colors = ['#111827', '#4B5563', '#10b981', '#f59e0b', '#ef4444'];
  const c = colors[index % colors.length];
  return (
    <Animated.View entering={FadeInRight.duration(400).delay(index * 50)}>
      <TouchableOpacity 
        activeOpacity={0.7} 
        style={s.card}
        onPress={() => router.push(`/batch/${item.id}`)}
      >
        <View style={[s.batchIcon, { backgroundColor: `${c}12` }]}>
          <BookOpen size={20} color={c} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.batchName} numberOfLines={1}>{item.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
            <Text style={s.batchMeta}>{item.subject || 'General'}</Text>
            {item.timeSlot && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Clock size={11} color={T.textMuted} />
                <Text style={[s.batchMeta, { color: T.textMuted }]}>{item.timeSlot}</Text>
              </View>
            )}
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <View style={s.countWrap}>
            <UsersIcon size={13} color={T.accent} />
            <Text style={s.countNum}>{item._count.students}</Text>
          </View>
          {item.isRegistrationOpen && (
            <View style={[s.statusDot, { backgroundColor: T.emerald }]}>
              <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>OPEN</Text>
            </View>
          )}
        </View>
        <ChevronRight size={18} color={T.textMuted} style={{ marginLeft: 6 }} />
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function BatchesScreen() {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  
  // Form State
  const [batchNumber, setBatchNumber] = useState('');
  const [customName, setCustomName] = useState('');
  const [subject, setSubject] = useState('Mathematics');
  const [allowedSubjects, setAllowedSubjects] = useState<string[]>([]);
  const [timeSlot, setTimeSlot] = useState('');
  const [className, setClassName] = useState('');
  
  // Config
  const [requiresGrades, setRequiresGrades] = useState(true);
  const [allowedClasses, setAllowedClasses] = useState<string[]>([]);

  const { data: batches, isLoading, refetch, isRefetching } = useQuery<Batch[]>({
    queryKey: ['batches'],
    queryFn: async () => {
      const res = await api.get('/batches');
      return res.data;
    },
  });

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await api.get('/institute/me');
        const config = res.data?.config || {};
        setRequiresGrades(config.requiresGrades !== false);
        if (Array.isArray(config.allowedClasses)) {
          setAllowedClasses(config.allowedClasses);
        }
        if (Array.isArray(config.subjects)) {
          setAllowedSubjects(config.subjects);
          if (config.subjects.length > 0) setSubject(config.subjects[0]);
        }
      } catch (e) {
        console.error("Failed to load config", e);
      }
    };
    loadConfig();
  }, []);

  const filtered = useMemo(() => {
    if (!batches) return [];
    if (!search) return batches;
    const q = search.toLowerCase();
    return batches.filter(b =>
      b.name.toLowerCase().includes(q) ||
      (b.subject?.toLowerCase().includes(q)) ||
      (b.className?.toLowerCase().includes(q))
    );
  }, [batches, search]);

  const totalStudents = useMemo(() =>
    (batches || []).reduce((sum, b) => sum + b._count.students, 0), [batches]);

  const handleCreate = async () => {
    if (!batchNumber || !timeSlot || (!className && requiresGrades) || !subject) {
      Alert.alert('Missing Fields', 'Please fill in all required fields.');
      return;
    }

    try {
      await api.post('/batches', {
        batchNumber,
        customName,
        subject,
        timeSlot,
        feeAmount: 0,
        className: requiresGrades ? className : undefined
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowForm(false);
      setBatchNumber(''); setCustomName(''); setTimeSlot(''); setClassName('');
      refetch();
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to create batch');
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <Animated.View entering={FadeInDown.duration(400)} style={s.headerArea}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <Text style={s.title}>Batches</Text>
            <Text style={s.subtitle}>{batches?.length ?? 0} batches • {totalStudents} students</Text>
          </View>
          <TouchableOpacity 
            style={s.createBtn}
            onPress={() => setShowForm(true)}
          >
            <Plus size={16} color={T.white} />
            <Text style={s.createBtnText}>New Batch</Text>
          </TouchableOpacity>
        </View>
        <View style={s.searchWrap}>
          <Search size={18} color={T.textMuted} />
          <TextInput
            placeholder="Search by name, subject, or class..."
            placeholderTextColor={T.textMuted}
            value={search} onChangeText={setSearch}
            style={s.searchInput}
          />
        </View>
      </Animated.View>

      <FlatList
        data={filtered}
        renderItem={({ item, index }) => <BatchCard item={item} index={index} />}
        keyExtractor={item => item.id}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={T.accent} />}
        ListEmptyComponent={
          isLoading ? (
            <View style={{ gap: 12 }}>
              {[1, 2, 3, 4].map(i => <SkeletonLoader key={i} width={width - 48} height={76} borderRadius={16} />)}
            </View>
          ) : (
            <View style={s.empty}>
              <BookOpen size={48} color={T.textMuted} />
              <Text style={s.emptyTitle}>No batches yet</Text>
              <Text style={s.emptyDesc}>Create your first batch using the button above.</Text>
            </View>
          )
        }
      />

      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowForm(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Create New Batch</Text>
            <TouchableOpacity onPress={() => setShowForm(false)} style={s.closeBtn}>
              <X size={20} color={T.textSec} />
            </TouchableOpacity>
          </View>
          
          <ScrollView contentContainerStyle={s.modalContent} showsVerticalScrollIndicator={false}>
            {requiresGrades && (
              <View style={s.inputGroup}>
                <Text style={s.label}>Class / Grade</Text>
                <View style={s.inputWrap}>
                  <GraduationCap size={18} color={T.textMuted} style={s.inputIcon} />
                  <TextInput 
                    style={s.input} 
                    placeholder="e.g. Class 10" 
                    value={className} 
                    onChangeText={setClassName} 
                  />
                </View>
              </View>
            )}

            <View style={s.inputGroup}>
              <Text style={s.label}>Batch Number</Text>
              <View style={s.inputWrap}>
                <Hash size={18} color={T.textMuted} style={s.inputIcon} />
                <TextInput 
                  style={s.input} 
                  placeholder="e.g. 1" 
                  keyboardType="number-pad"
                  value={batchNumber} 
                  onChangeText={setBatchNumber} 
                />
              </View>
            </View>

            <View style={s.inputGroup}>
              <Text style={s.label}>Batch Name (Optional)</Text>
              <View style={s.inputWrap}>
                <Type size={18} color={T.textMuted} style={s.inputIcon} />
                <TextInput 
                  style={s.input} 
                  placeholder="e.g. Target 2026 Batch" 
                  value={customName} 
                  onChangeText={setCustomName} 
                />
              </View>
            </View>

            <View style={s.inputGroup}>
              <Text style={s.label}>Subject</Text>
              <View style={s.inputWrap}>
                <BookOpen size={18} color={T.textMuted} style={s.inputIcon} />
                <TextInput 
                  style={s.input} 
                  placeholder="e.g. Mathematics" 
                  value={subject} 
                  onChangeText={setSubject} 
                />
              </View>
            </View>

            <View style={s.inputGroup}>
              <Text style={s.label}>Time Slot</Text>
              <View style={s.inputWrap}>
                <Clock size={18} color={T.textMuted} style={s.inputIcon} />
                <TextInput 
                  style={s.input} 
                  placeholder="e.g. Mon-Wed-Fri 4 PM" 
                  value={timeSlot} 
                  onChangeText={setTimeSlot} 
                />
              </View>
            </View>

            <TouchableOpacity style={s.submitBtn} onPress={handleCreate}>
              <Text style={s.submitBtnText}>Save Batch</Text>
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
  batchIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  batchName: { color: T.text, fontSize: 16, fontWeight: '600' },
  batchMeta: { color: T.textSec, fontSize: 12 },
  countWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: `${T.accent}10`, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
  },
  countNum: { color: T.accent, fontSize: 13, fontWeight: '700' },
  statusDot: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
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
  submitBtn: {
    backgroundColor: T.accent, height: 56, borderRadius: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 12, shadowColor: T.shadow, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1, shadowRadius: 12, elevation: 4,
  },
  submitBtnText: { color: T.white, fontSize: 16, fontWeight: '700' },
});
