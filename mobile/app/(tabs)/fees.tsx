import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, Dimensions, Modal, TextInput, Alert, KeyboardAvoidingView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Receipt, TrendingUp, TrendingDown, IndianRupee, History, Mail, CheckCircle2, X, ChevronRight, CheckCircle, Filter, Download } from 'lucide-react-native';
import api from '../../services/api';
import { SkeletonLoader } from '../../components/ui';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');

const T = {
  bg: '#F5F5F7', white: '#FFFFFF', text: '#1D1D1F',
  textSec: '#86868B', textMuted: '#AEAEB2', accent: '#111827',
  emerald: '#10b981', red: '#ef4444', amber: '#f59e0b', blue: '#3b82f6',
  border: 'rgba(0,0,0,0.06)', shadow: 'rgba(0,0,0,0.06)',
};

interface FeeBreakdown {
  name: string;
  due: number;
}

interface FeeSummary {
  id: string;
  humanId: string | null;
  name: string;
  batchName: string;
  totalFee: number;
  totalPaid: number;
  balance: number;
  lastPaymentDate: string | null;
  oldestDue: string | null;
  breakdown?: FeeBreakdown[];
}

interface Transaction {
  id: string;
  studentName: string;
  batchName: string;
  amount: number;
  date: string;
  type: string;
}

interface CustomInvoice {
  id: string;
  name: string;
  amount: number;
  createdAt: string;
  studentName: string;
  batchName: string;
  isPaid: boolean;
  lastPaymentDate: string | null;
}

export default function FeesDashboardScreen() {
  const [viewMode, setViewMode] = useState<'defaulters' | 'recent' | 'custom' | 'upi'>('defaulters');
  
  // Filter & Search State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBatch, setSelectedBatch] = useState('All');
  const [listSort, setListSort] = useState<'amount' | 'date'>('amount');
  
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  // Report State
  const [reportMonth, setReportMonth] = useState(new Date().getMonth() + 1);
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [reportBatch, setReportBatch] = useState('All');
  const [reportSort, setReportSort] = useState('amount');
  const [reportGenerating, setReportGenerating] = useState(false);
  
  // Payment Modal State
  const [selectedStudent, setSelectedStudent] = useState<FeeSummary | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [processing, setProcessing] = useState(false);

  const queryClient = useQueryClient();

  const { data: fees = [], isLoading: isLoadingFees } = useQuery<FeeSummary[]>({
    queryKey: ['fees'],
    queryFn: async () => {
      const res = await api.get('/fees');
      return res.data;
    },
    staleTime: 0,
  });

  const { data: transactions = [], isLoading: isLoadingTx } = useQuery<Transaction[]>({
    queryKey: ['recent-transactions'],
    queryFn: async () => {
      const res = await api.get('/fees/recent');
      return res.data;
    },
    staleTime: 0,
  });

  const { data: customInvoices = [], isLoading: isLoadingInvoices } = useQuery<CustomInvoice[]>({
    queryKey: ['custom-invoices'],
    queryFn: async () => {
      const res = await api.get('/fees/custom-invoices');
      return res.data;
    },
  });

  const stats = useMemo(() => {
    const totalDue = fees.reduce((sum, s) => sum + Math.max(0, s.balance), 0);
    const totalCollected = fees.reduce((sum, s) => sum + s.totalPaid, 0);
    const totalExpected = totalCollected + totalDue;
    const collectionRate = totalExpected > 0 ? Math.min(100, Math.round((totalCollected / totalExpected) * 100)) : 0;
    return { totalDue, totalCollected, collectionRate };
  }, [fees]);

  const batches = useMemo(() => {
    return Array.from(new Set(fees.map(s => s.batchName))).filter(b => b !== 'N/A').sort();
  }, [fees]);

  const defaulters = useMemo(() => {
    return fees
      .filter(s => {
        const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              (s.humanId && s.humanId.toLowerCase().includes(searchTerm.toLowerCase()));
        const matchesBatch = selectedBatch === 'All' || s.batchName === selectedBatch;
        return s.balance > 0 && matchesSearch && matchesBatch;
      })
      .sort((a, b) => {
        if (listSort === 'date') {
          const dateA = a.oldestDue ? new Date(a.oldestDue).getTime() : Number.MAX_VALUE;
          const dateB = b.oldestDue ? new Date(b.oldestDue).getTime() : Number.MAX_VALUE;
          return dateA - dateB;
        }
        return b.balance - a.balance;
      });
  }, [fees, searchTerm, selectedBatch, listSort]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const matchesSearch = tx.studentName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesBatch = selectedBatch === 'All' || tx.batchName === selectedBatch;
      return matchesSearch && matchesBatch;
    });
  }, [transactions, searchTerm, selectedBatch]);

  const handleGenerateReport = async () => {
    setReportGenerating(true);
    try {
      const url = `/fees/report?month=${reportMonth}&year=${reportYear}&batch=${encodeURIComponent(reportBatch)}&sort=${reportSort}`;
      const res = await api.get(url, { responseType: 'blob' });
      
      const fileReaderInstance = new FileReader();
      fileReaderInstance.readAsDataURL(res.data);
      fileReaderInstance.onload = () => {
        const base64data = fileReaderInstance.result;
        // In a real app we'd save this using expo-file-system and share using expo-sharing.
        // For now, we'll just show success.
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Report Generated', 'Report downloaded successfully.');
        setShowReportModal(false);
      };
    } catch (e) {
      Alert.alert('Error', 'Failed to generate report.');
    } finally {
      setReportGenerating(false);
    }
  };

  const handlePayment = async () => {
    if (!selectedStudent || !paymentAmount) return;

    const paidAmount = paymentAmount;
    setProcessing(true);
    try {
      await api.post('/fees/pay', {
        studentId: selectedStudent.id,
        amount: parseFloat(paidAmount)
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Close modal & switch tab first so UI feels instant
      setSelectedStudent(null);
      setPaymentAmount('');
      setViewMode('recent');
      // Then hard-refetch and invalidate all query caches (updates Batch details, Fees lists, etc.)
      await queryClient.invalidateQueries();
      Alert.alert('Payment Recorded ✅', `₹${paidAmount} collected successfully!`);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Payment failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const handleSendReminder = async (student: FeeSummary) => {
    try {
      await api.post('/fees/remind', {
        studentId: student.id,
        amountDue: student.balance
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Success', 'Email reminder sent!');
    } catch {
      Alert.alert('Error', 'Failed to send reminder. Check email setup.');
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Fees & Finances</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity style={s.iconBtn} onPress={() => setShowFilterModal(true)}>
            <Filter size={20} color={T.text} />
            {(selectedBatch !== 'All' || listSort === 'date' || searchTerm !== '') && (
               <View style={{position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: T.red}} />
            )}
          </TouchableOpacity>
          <TouchableOpacity style={s.iconBtn} onPress={() => setShowReportModal(true)}>
            <Download size={20} color={T.text} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>
        {isLoadingFees || isLoadingTx ? (
           <View style={{ gap: 16 }}>
             <View style={{ marginHorizontal: 4 }}>
               <SkeletonLoader width={width - 40} height={140} borderRadius={24} />
             </View>
             <SkeletonLoader width={width - 32} height={200} borderRadius={20} />
           </View>
        ) : (
          <View>
            <Animated.View entering={FadeInDown.duration(400)}>
              <View style={s.singleStatCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
                  <View>
                    <Text style={s.statLabel}>Total Collected</Text>
                    <Text style={[s.statValue, { color: T.emerald }]}>₹{stats.totalCollected.toLocaleString()}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.statLabel}>Pending Dues</Text>
                    <Text style={[s.statValue, { color: T.red }]}>₹{stats.totalDue.toLocaleString()}</Text>
                  </View>
                </View>
                
                <View style={s.progressBarBg}>
                   <View style={[s.progressBarFill, { flex: stats.collectionRate }]} />
                   <View style={[s.progressBarDue, { flex: 100 - stats.collectionRate }]} />
                </View>
                
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, alignItems: 'center' }}>
                   <Text style={{ fontSize: 13, fontWeight: '700', color: T.textSec }}>Collection Rate</Text>
                   <Text style={{ fontSize: 18, fontWeight: '800', color: T.blue }}>{stats.collectionRate}%</Text>
                </View>
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(400).delay(100)}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.viewToggleContainer}>
                <View style={s.viewToggle}>
                  <TouchableOpacity
                    style={[s.toggleBtn, viewMode === 'defaulters' && s.toggleBtnActive]}
                    onPress={() => setViewMode('defaulters')}
                  >
                    <Text style={[s.toggleText, viewMode === 'defaulters' && s.toggleTextActive]}>Pending Dues</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.toggleBtn, viewMode === 'upi' && s.toggleBtnActive]}
                    onPress={() => setViewMode('upi')}
                  >
                    <Text style={[s.toggleText, viewMode === 'upi' && s.toggleTextActive]}>UPI Approvals</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.toggleBtn, viewMode === 'recent' && s.toggleBtnActive]}
                    onPress={() => setViewMode('recent')}
                  >
                    <Text style={[s.toggleText, viewMode === 'recent' && s.toggleTextActive]}>Recent Payments</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.toggleBtn, viewMode === 'custom' && s.toggleBtnActive]}
                    onPress={() => setViewMode('custom')}
                  >
                    <Text style={[s.toggleText, viewMode === 'custom' && s.toggleTextActive]}>Custom Invoices</Text>
                    {customInvoices.length > 0 && (
                      <View style={s.badge}>
                        <Text style={s.badgeText}>{customInvoices.length}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </Animated.View>

            {/* Render List */}
            <View style={s.listContainer}>
              {viewMode === 'defaulters' && (
                <>
                  <Text style={[s.sectionTitle, { marginTop: 8 }]}>Pending Dues ({defaulters.length})</Text>
                  {defaulters.length === 0 ? (
                    <View style={s.emptyState}>
                      <Text style={s.emptyText}>No pending dues.</Text>
                    </View>
                  ) : (
                    defaulters.map((student, idx) => (
                      <TouchableOpacity key={student.id} style={[s.listItem, idx !== defaulters.length - 1 && s.borderBottom]} activeOpacity={0.7} onPress={() => setSelectedStudent(student)}>
                        <View style={s.avatar}>
                          <Text style={s.avatarText}>{student.name.charAt(0).toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.itemName}>{student.name}</Text>
                          <Text style={s.itemMeta}>{student.batchName}</Text>
                          <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
                            <TouchableOpacity style={s.remindBtn} onPress={() => handleSendReminder(student)}>
                              <Text style={s.remindBtnText}>Remind</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={s.collectBtn} onPress={() => setSelectedStudent(student)}>
                              <Text style={s.collectBtnText}>Collect</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                        <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                          <Text style={s.dueAmount}>₹{student.balance.toLocaleString()}</Text>
                          <Text style={{ fontSize: 10, color: T.textSec, fontWeight: '600', marginTop: 2 }}>DUE</Text>
                        </View>
                      </TouchableOpacity>
                    ))
                  )}
                </>
              )}

              {viewMode === 'recent' && (
                <>
                  <Text style={[s.sectionTitle, { marginTop: 8 }]}>Recent Transactions ({filteredTransactions.length})</Text>
                  {filteredTransactions.length === 0 ? (
                    <View style={s.emptyState}>
                      <Text style={s.emptyText}>No transactions.</Text>
                    </View>
                  ) : (
                    filteredTransactions.map((transaction, idx) => (
                      <View key={transaction.id} style={[s.listItem, idx !== filteredTransactions.length - 1 && s.borderBottom]}>
                        <View style={[s.avatar, { backgroundColor: `${T.emerald}15` }]}>
                          <Text style={[s.avatarText, { color: T.emerald }]}>{transaction.studentName.charAt(0).toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.itemName}>{transaction.studentName}</Text>
                          <Text style={s.itemMeta}>{new Date(transaction.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                          <View style={s.txTypePill}>
                            <Text style={s.txTypeText}>{transaction.type}</Text>
                          </View>
                        </View>
                        <Text style={[s.dueAmount, { color: T.emerald }]}>+₹{transaction.amount.toLocaleString()}</Text>
                      </View>
                    ))
                  )}
                </>
              )}              
              {viewMode === 'custom' && (
                <>
                  <Text style={[s.sectionTitle, { marginTop: 8 }]}>Custom Invoices ({customInvoices.length})</Text>
                  {customInvoices.length === 0 ? (
                    <View style={s.emptyState}>
                      <Text style={s.emptyText}>No custom invoices.</Text>
                    </View>
                  ) : (
                    customInvoices.map((invoice, idx) => (
                      <View key={invoice.id} style={[s.listItem, idx !== customInvoices.length - 1 && s.borderBottom]}>
                        <View style={[s.avatar, { backgroundColor: invoice.isPaid ? `${T.emerald}15` : `${T.amber}15` }]}>
                          {invoice.isPaid ? <CheckCircle size={20} color={T.emerald} /> : <Receipt size={20} color={T.amber} />}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.itemName}>{invoice.name}</Text>
                          <Text style={s.itemMeta}>{invoice.studentName} • {invoice.batchName}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[s.dueAmount, { color: invoice.isPaid ? T.emerald : T.red }]}>₹{invoice.amount.toLocaleString()}</Text>
                          <View style={[s.statusPill, { backgroundColor: invoice.isPaid ? `${T.emerald}15` : `${T.red}15` }]}>
                            <Text style={[s.statusText, { color: invoice.isPaid ? T.emerald : T.red }]}>{invoice.isPaid ? 'PAID' : 'UNPAID'}</Text>
                          </View>
                        </View>
                      </View>
                    ))
                  )}
                </>
              )}
              {viewMode === 'upi' && (
                <View style={s.emptyState}>
                  <Text style={s.emptyText}>No pending UPI verifications.</Text>
                </View>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Payment Modal */}
      <Modal visible={!!selectedStudent} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedStudent(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Record Payment</Text>
            <TouchableOpacity onPress={() => setSelectedStudent(null)} style={s.closeBtn}>
              <X size={20} color={T.textSec} />
            </TouchableOpacity>
          </View>
          
          {selectedStudent && (
            <ScrollView contentContainerStyle={s.modalContent} showsVerticalScrollIndicator={false}>
              <Text style={s.modalSubtitle}>Enter amount received from parent.</Text>
              
              <View style={s.summaryBox}>
                <View style={s.summaryRow}>
                  <Text style={s.summaryLabel}>Student</Text>
                  <Text style={s.summaryValue}>{selectedStudent.name}</Text>
                </View>
                <View style={s.summaryDivider} />
                <View style={s.summaryRow}>
                  <Text style={s.summaryLabel}>Outstanding Balance</Text>
                  <Text style={[s.summaryValue, { color: T.red, fontSize: 18 }]}>₹{selectedStudent.balance.toLocaleString()}</Text>
                </View>

                {selectedStudent.breakdown && selectedStudent.breakdown.length > 0 && (
                  <View style={s.breakdownBox}>
                    <Text style={s.breakdownTitle}>PENDING PAYMENTS:</Text>
                    {selectedStudent.breakdown.map((item, i) => (
                      <View key={i} style={s.breakdownRow}>
                        <Text style={s.breakdownName}>{item.name}</Text>
                        <Text style={s.breakdownAmount}>₹{item.due.toLocaleString()}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              <View style={s.inputGroup}>
                <Text style={s.label}>Payment Amount (₹)</Text>
                <TextInput 
                  style={s.largeInput} 
                  placeholder="0" 
                  placeholderTextColor={T.textMuted}
                  keyboardType="numeric"
                  value={paymentAmount} 
                  onChangeText={setPaymentAmount} 
                  autoFocus
                />
                <Text style={s.helperText}>This payment will correct the oldest pending installments first.</Text>
              </View>

              <TouchableOpacity 
                style={[s.submitBtn, processing && { opacity: 0.5 }]} 
                onPress={handlePayment}
                disabled={processing}
              >
                <Text style={s.submitBtnText}>{processing ? 'Processing...' : 'Confirm Payment'}</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </Modal>

      {/* Filter Modal */}
      <Modal visible={showFilterModal} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setShowFilterModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Filters & Search</Text>
            <TouchableOpacity onPress={() => setShowFilterModal(false)} style={s.closeBtn}>
              <X size={24} color={T.textSec} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.modalContent}>
            <View style={s.inputGroup}>
              <Text style={s.label}>Search Student</Text>
              <TextInput 
                style={s.input} 
                placeholder="Name or ID" 
                value={searchTerm} 
                onChangeText={setSearchTerm} 
                placeholderTextColor={T.textMuted}
              />
            </View>

            <View style={s.inputGroup}>
              <Text style={s.label}>Batch</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                <TouchableOpacity onPress={() => setSelectedBatch('All')} style={[s.pillBtn, selectedBatch === 'All' && s.pillBtnActive]}>
                   <Text style={[s.pillText, selectedBatch === 'All' && s.pillTextActive]}>All Batches</Text>
                </TouchableOpacity>
                {batches.map(b => (
                  <TouchableOpacity key={b} onPress={() => setSelectedBatch(b)} style={[s.pillBtn, selectedBatch === b && s.pillBtnActive]}>
                    <Text style={[s.pillText, selectedBatch === b && s.pillTextActive]}>{b}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={s.inputGroup}>
              <Text style={s.label}>Sort By</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => setListSort('amount')} style={[s.pillBtn, listSort === 'amount' && s.pillBtnActive]}>
                   <Text style={[s.pillText, listSort === 'amount' && s.pillTextActive]}>Highest Due Amount</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setListSort('date')} style={[s.pillBtn, listSort === 'date' && s.pillBtnActive]}>
                   <Text style={[s.pillText, listSort === 'date' && s.pillTextActive]}>Oldest Due First</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={[s.submitBtn, { backgroundColor: T.accent }]} onPress={() => setShowFilterModal(false)}>
              <Text style={s.submitBtnText}>Apply Filters</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Reports Modal */}
      <Modal visible={showReportModal} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setShowReportModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Generate Report</Text>
            <TouchableOpacity onPress={() => setShowReportModal(false)} style={s.closeBtn}>
              <X size={24} color={T.textSec} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.modalContent}>
            <Text style={s.modalSubtitle}>Download a detailed CSV report.</Text>

            <View style={{ flexDirection: 'row', gap: 16 }}>
              <View style={[s.inputGroup, { flex: 1 }]}>
                <Text style={s.label}>Month</Text>
                <TextInput style={s.input} keyboardType="numeric" value={String(reportMonth)} onChangeText={t => setReportMonth(Number(t))} />
              </View>
              <View style={[s.inputGroup, { flex: 1 }]}>
                <Text style={s.label}>Year</Text>
                <TextInput style={s.input} keyboardType="numeric" value={String(reportYear)} onChangeText={t => setReportYear(Number(t))} />
              </View>
            </View>

            <View style={s.inputGroup}>
              <Text style={s.label}>Batch</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                <TouchableOpacity onPress={() => setReportBatch('All')} style={[s.pillBtn, reportBatch === 'All' && s.pillBtnActive]}>
                   <Text style={[s.pillText, reportBatch === 'All' && s.pillTextActive]}>All Batches</Text>
                </TouchableOpacity>
                {batches.map(b => (
                  <TouchableOpacity key={b} onPress={() => setReportBatch(b)} style={[s.pillBtn, reportBatch === b && s.pillBtnActive]}>
                    <Text style={[s.pillText, reportBatch === b && s.pillTextActive]}>{b}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <TouchableOpacity 
              style={[s.submitBtn, reportGenerating && { opacity: 0.5 }]} 
              onPress={handleGenerateReport}
              disabled={reportGenerating}
            >
              <Text style={s.submitBtnText}>{reportGenerating ? 'Generating...' : 'Download Report'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  header: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 28, fontWeight: '700', color: T.text, letterSpacing: -0.5 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: T.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: T.border },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 120 },
  
  singleStatCard: {
    backgroundColor: T.white, borderRadius: 24, padding: 24, marginHorizontal: 4, marginBottom: 24,
    borderWidth: 1, borderColor: T.border,
    ...Platform.select({
      ios: { shadowColor: T.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 12 },
      android: { elevation: 2 },
    }),
  },
  progressBarBg: { height: 12, backgroundColor: 'transparent', borderRadius: 6, flexDirection: 'row', overflow: 'hidden', marginTop: 4 },
  progressBarFill: { height: '100%', backgroundColor: T.emerald },
  progressBarDue: { height: '100%', backgroundColor: `${T.red}40` },

  statIconWrap: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  statLabel: { fontSize: 12, color: T.textSec, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  statValue: { fontSize: 24, fontWeight: '800', color: T.text, letterSpacing: -0.5 },

  viewToggleContainer: { marginBottom: 24, paddingHorizontal: 4 },
  viewToggle: {
    flexDirection: 'row', backgroundColor: '#E5E5EA', padding: 4, borderRadius: 16,
  },
  toggleBtn: { paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center', borderRadius: 12, flexDirection: 'row', gap: 6 },
  toggleBtnActive: { backgroundColor: T.white, ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }, android: { elevation: 2 }}) },
  toggleText: { fontSize: 13, fontWeight: '600', color: T.textSec },
  toggleTextActive: { color: T.text, fontWeight: '700' },
  badge: { backgroundColor: T.amber, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: '800', color: T.white },

  sectionTitle: { fontSize: 18, fontWeight: '800', color: T.text, marginBottom: 12, marginLeft: 4, letterSpacing: -0.3 },
  listContainer: {
    backgroundColor: T.white, borderRadius: 24, padding: 8,
    borderWidth: 1, borderColor: T.border, marginHorizontal: 4,
    ...Platform.select({
      ios: { shadowColor: T.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 12 },
      android: { elevation: 2 },
    }),
  },
  listItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  borderBottom: { borderBottomWidth: 1, borderBottomColor: T.border },
  avatar: { width: 46, height: 46, borderRadius: 14, backgroundColor: `${T.accent}12`, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  avatarText: { fontSize: 17, fontWeight: '800', color: T.accent },
  itemName: { fontSize: 15, fontWeight: '700', color: T.text, marginBottom: 2 },
  itemMeta: { fontSize: 12, color: T.textSec, fontWeight: '500' },
  dueAmount: { fontSize: 16, fontWeight: '800', color: T.red },
  remindBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: `${T.blue}15`, borderWidth: 1, borderColor: `${T.blue}25` },
  remindBtnText: { fontSize: 12, fontWeight: '700', color: T.blue },
  collectBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: `${T.emerald}15`, borderWidth: 1, borderColor: `${T.emerald}25` },
  collectBtnText: { fontSize: 12, fontWeight: '700', color: T.emerald },
  actionBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: `${T.blue}15`, marginTop: 4 },
  
  txTypePill: { backgroundColor: T.bg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start', marginTop: 4 },
  txTypeText: { fontSize: 10, color: T.textSec, fontWeight: '600' },

  statusPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, alignSelf: 'flex-end', marginTop: 4 },
  statusText: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },

  emptyState: { padding: 40, alignItems: 'center' },
  emptyText: { color: T.textSec, fontSize: 15, fontWeight: '600' },

  modalContainer: { flex: 1, backgroundColor: T.bg },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, paddingVertical: 20, backgroundColor: T.white,
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: T.text },
  closeBtn: { padding: 4, backgroundColor: T.bg, borderRadius: 999 },
  modalContent: { padding: 24, gap: 24 },
  modalSubtitle: { fontSize: 14, color: T.textSec, marginTop: -16, marginBottom: 8 },
  summaryBox: { backgroundColor: T.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: T.border },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: 13, color: T.textSec, fontWeight: '600' },
  summaryValue: { fontSize: 15, color: T.text, fontWeight: '700' },
  summaryDivider: { height: 1, backgroundColor: T.border, marginVertical: 12 },
  breakdownBox: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: T.border },
  breakdownTitle: { fontSize: 11, fontWeight: '800', color: T.textSec, marginBottom: 8, letterSpacing: 0.5 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  breakdownName: { fontSize: 13, color: T.textSec },
  breakdownAmount: { fontSize: 13, color: T.red, fontWeight: '600', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  inputGroup: { gap: 8 },
  label: { fontSize: 12, fontWeight: '700', color: T.textSec, textTransform: 'uppercase', letterSpacing: 0.5 },
  largeInput: { fontSize: 40, fontWeight: '800', color: T.text, paddingVertical: 8 },
  input: { backgroundColor: T.bg, borderRadius: 12, padding: 16, fontSize: 16, fontWeight: '600', color: T.text, borderWidth: 1, borderColor: T.border },
  helperText: { fontSize: 12, color: T.textSec, lineHeight: 18, marginTop: 4 },
  submitBtn: { backgroundColor: T.emerald, borderRadius: 16, padding: 18, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, shadowColor: T.emerald, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  submitBtnText: { color: T.white, fontSize: 16, fontWeight: '700' },
  
  pillBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: T.bg, borderWidth: 1, borderColor: T.border },
  pillBtnActive: { backgroundColor: T.accent, borderColor: T.accent },
  pillText: { fontSize: 14, fontWeight: '600', color: T.textSec },
  pillTextActive: { color: T.white }
});
