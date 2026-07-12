import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Platform, Dimensions, Linking, Alert, Modal, TextInput, KeyboardAvoidingView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen, Users, Clock, ChevronLeft, AlertCircle, Phone, Mail, FileText,
  Book, User as UserIcon, Eye, Download, Printer, Plus, Settings, Edit2, Trash2, X, QrCode, MonitorPlay, Send, Receipt, Check, IndianRupee
} from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import api from '../../services/api';
import { SkeletonLoader, BrandButton } from '../../components/ui';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { getItemAsync } from '../../services/storage';

const { width } = Dimensions.get('window');

const T = {
  bg: '#F5F5F7', white: '#FFFFFF', text: '#1D1D1F',
  textSec: '#86868B', textMuted: '#AEAEB2', accent: '#111827',
  teal: '#4B5563', emerald: '#10b981', amber: '#f59e0b', red: '#ef4444', blue: '#3b82f6',
  border: 'rgba(0,0,0,0.06)', shadow: 'rgba(0,0,0,0.06)',
};

interface BatchDetails {
  id: string;
  name: string;
  subject: string | null;
  className: string | null;
  timeSlot: string | null;
  feeAmount: number;
  whatsappGroupLink: string | null;
  isRegistrationOpen: boolean;
  students: Array<{
    id: string;
    humanId: string | null;
    name: string;
    status: string;
    parentName: string;
    parentWhatsapp: string;
    schoolName: string | null;
    feePayments: { amountPaid: number; installmentId: string }[];
    fees: { amount: number; status: string }[];
    marks: Array<{
      id: string;
      score: number;
      test: { maxMarks: number; name: string };
    }>;
  }>;
  feeInstallments: Array<{
    id: string;
    name: string;
    amount: number;
    createdAt: string;
    studentId?: string | null;
  }>;
}

export default function BatchDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  const { data: batch, isLoading, refetch } = useQuery<BatchDetails>({
    queryKey: ['batch', id],
    queryFn: async () => {
      const res = await api.get(`/batches/${id}`);
      return res.data;
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [inviteWhatsapp, setInviteWhatsapp] = useState('');

  const [editStudentId, setEditStudentId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', humanId: '', parentName: '', parentWhatsapp: '', schoolName: '' });

  const [viewMarksStudent, setViewMarksStudent] = useState<any>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isQrOpen, setIsQrOpen] = useState(false);

  // Custom Invoice State
  const [showCustomInvoice, setShowCustomInvoice] = useState<any>(null);
  const [customInvoice, setCustomInvoice] = useState({ name: '', amount: '', markAsPaid: false, existingInstallmentId: '' });
  const [isBatchSettingsOpen, setIsBatchSettingsOpen] = useState(false);
  const [batchForm, setBatchForm] = useState({ name: '', subject: '', className: '', timeSlot: '', whatsappGroupLink: '', feeAmount: '' });
  const [isFeeSettingsOpen, setIsFeeSettingsOpen] = useState(false);
  const [feeForm, setFeeForm] = useState({ name: '', amount: '' });
  const [editInstallment, setEditInstallment] = useState<{ id: string; name: string; amount: string } | null>(null);

  const handleDownload = async (type: 'pdf' | 'stickers') => {
    setIsDownloading(true);
    try {
      const token = await getItemAsync('auth_token');
      const url = type === 'pdf' ? `/batches/${id}/download` : `/stickers/download?batchId=${id}`;
      const baseUrl = api.defaults.baseURL || 'http://localhost:3001/api';
      const fileUri = FileSystem.documentDirectory + `${type}_${id}.pdf`;

      const res = await FileSystem.downloadAsync(`${baseUrl}${url}`, fileUri, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(res.uri);
      } else {
        Alert.alert("Success", "File downloaded, but sharing is not supported.");
      }
    } catch (e: any) {
      Alert.alert("Download Failed", "There was an error generating the file.");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleAddSubmit = async () => {
    if (!inviteWhatsapp || inviteWhatsapp.length < 10) return Alert.alert("Required", "10-digit WhatsApp number is mandatory");
    try {
      await api.post(`/batches/${id}/invite`, { whatsappNumber: inviteWhatsapp });
      setIsAddOpen(false);
      setInviteWhatsapp('');
      Alert.alert("Success", "Invite link sent to WhatsApp!");
    } catch(e: any) {
      Alert.alert("Error", e.response?.data?.error || "Failed to send invite");
    }
  };

  const handleToggleRegistration = async () => {
    try {
      await api.put(`/batches/${id}`, { isRegistrationOpen: !batch?.isRegistrationOpen });
      refetch();
    } catch(e: any) {
      Alert.alert("Error", "Failed to toggle registration");
    }
  };

  const openBatchSettings = () => {
    if (!batch) return;
    setBatchForm({
      name: batch.name || '',
      subject: batch.subject || '',
      className: batch.className || '',
      timeSlot: batch.timeSlot || '',
      whatsappGroupLink: batch.whatsappGroupLink || '',
      feeAmount: batch.feeAmount ? batch.feeAmount.toString() : ''
    });
    setIsBatchSettingsOpen(true);
  };

  const handleBatchSettingsSave = async () => {
    if (!batchForm.name) return Alert.alert("Required", "Batch name is mandatory");
    try {
      await api.put(`/batches/${id}`, {
        name: batchForm.name,
        subject: batchForm.subject,
        className: batchForm.className,
        timeSlot: batchForm.timeSlot,
        whatsappGroupLink: batchForm.whatsappGroupLink,
        feeAmount: Number(batchForm.feeAmount) || 0
      });
      setIsBatchSettingsOpen(false);
      refetch();
      Alert.alert("Success", "Batch settings updated");
    } catch(e: any) {
      Alert.alert("Error", e.response?.data?.error || "Failed to update batch");
    }
  };

  const handleFeeInstallmentAdd = async () => {
    if (!feeForm.name || !feeForm.amount) return Alert.alert("Required", "Name and Amount are mandatory");
    try {
      await api.post(`/batches/${id}/installments`, {
        name: feeForm.name,
        amount: Number(feeForm.amount)
      });
      setFeeForm({ name: '', amount: '' });
      setIsFeeSettingsOpen(false);
      refetch();
      Alert.alert("Success", "Installment created");
    } catch(e: any) {
      Alert.alert("Error", e.response?.data?.error || "Failed to create installment");
    }
  };

  const handleFeeInstallmentEdit = async () => {
    if (!editInstallment || !editInstallment.name || !editInstallment.amount) return;
    try {
      await api.put(`/installments/${editInstallment.id}`, {
        name: editInstallment.name,
        amount: Number(editInstallment.amount)
      });
      setEditInstallment(null);
      refetch();
      Alert.alert('Updated', 'Installment updated successfully');
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to update installment');
    }
  };

  const handleCreateCustomInvoice = async () => {
    if (!showCustomInvoice) return;
    try {
      if (customInvoice.existingInstallmentId) {
        const existingInst = batch?.feeInstallments?.find(i => i.id === customInvoice.existingInstallmentId);
        
        if (existingInst && existingInst.studentId) {
          // This is a custom installment owned by another student. 
          // Clone it into a NEW custom invoice for the target student.
          await api.post('/fees/custom-invoices', {
            name: existingInst.name,
            amount: Number(existingInst.amount),
            studentId: showCustomInvoice.id,
            markAsPaid: customInvoice.markAsPaid
          });
          Alert.alert("Success", customInvoice.markAsPaid ? "Invoice cloned and marked as paid" : "Invoice cloned for this student");
        } else {
          // This is a global batch installment, safe to reuse directly
          if (customInvoice.markAsPaid) {
            const paymentAmount = Number(existingInst?.amount || 0);
            await api.post('/fees/pay-installment', {
              studentId: showCustomInvoice.id,
              installmentId: customInvoice.existingInstallmentId,
              amount: paymentAmount,
              date: new Date().toISOString().split('T')[0]
            });
          }
          Alert.alert("Success", customInvoice.markAsPaid ? "Installment marked as paid" : "This installment is already visible for this student");
        }
      } else {
        if (!customInvoice.name || !customInvoice.amount) return Alert.alert("Required", "Invoice Name and Amount are mandatory");
        await api.post('/fees/custom-invoices', {
          name: customInvoice.name,
          amount: Number(customInvoice.amount),
          studentId: showCustomInvoice.id,
          markAsPaid: customInvoice.markAsPaid
        });
        Alert.alert("Success", "Invoice created successfully");
      }
      setShowCustomInvoice(null);
      setCustomInvoice({ name: '', amount: '', markAsPaid: false, existingInstallmentId: '' });
      refetch();
    } catch(e: any) {
      Alert.alert("Error", e.response?.data?.error || "Failed to process invoice");
    }
  };

  const handleEditSubmit = async () => {
    if (!editForm.name) return Alert.alert("Required", "Name is mandatory");
    try {
      await api.put(`/students/${editStudentId}`, editForm);
      setEditStudentId(null);
      refetch();
    } catch(e: any) {
      Alert.alert("Error", "Failed to update student");
    }
  };

  const students = useMemo(() => batch?.students || [], [batch]);
  const invoiceTemplates = useMemo(() => {
    const seen = new Set<string>();
    return (batch?.feeInstallments || []).filter(inst => {
      const key = `${inst.name}::${inst.amount}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [batch?.feeInstallments]);

  const getStudentAverage = (student: any) => {
    if (!student.marks || student.marks.length === 0) return '-';
    let totalNormalized = 0;
    student.marks.forEach((m: any) => {
      const max = m.test?.maxMarks || 0;
      const normalized = max > 0 ? (m.score / max) * 10 : 0;
      totalNormalized += normalized;
    });
    return (totalNormalized / student.marks.length).toFixed(1);
  };

  const calcPendingForStudent = (s: any) => {
    const totalFee = batch?.feeAmount || 0;
    const paidLinked = s.feePayments?.reduce((sum: number, p: any) => sum + p.amountPaid, 0) || 0;
    const paidGeneric = s.fees?.filter((f: any) => f.status === 'PAID').reduce((sum: number, f: any) => sum + f.amount, 0) || 0;
    return Math.max(0, totalFee - (paidLinked + paidGeneric));
  };

  const totalCollected = useMemo(() => {
    return students.reduce((sum, s) => {
      const totalFee = batch?.feeAmount || 0;
      const pending = calcPendingForStudent(s);
      return sum + (Math.max(0, totalFee - pending));
    }, 0);
  }, [students, batch]);

  const totalPending = useMemo(() => {
    return students.reduce((sum, s) => sum + calcPendingForStudent(s), 0);
  }, [students, batch]);

  const onCall = (phone: string) => {
    if (phone) Linking.openURL(`tel:${phone}`);
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.navBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={T.text} />
        </TouchableOpacity>
        <Text style={s.navTitle} numberOfLines={1}>{batch?.name || 'Batch Details'}</Text>
        <View style={s.navRight}>
           {!isLoading && batch && (
             <TouchableOpacity style={s.headerActionBtn} onPress={openBatchSettings}>
               <Settings size={20} color={T.text} />
             </TouchableOpacity>
           )}
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>
        {isLoading ? (
          <View style={{ gap: 16 }}>
            <SkeletonLoader width={width - 32} height={180} borderRadius={24} />
            <SkeletonLoader width={width - 32} height={80} borderRadius={20} />
            <SkeletonLoader width={width - 32} height={200} borderRadius={20} />
          </View>
        ) : !batch ? (
          <View style={s.empty}>
            <AlertCircle size={48} color={T.textMuted} />
            <Text style={s.emptyTitle}>Batch not found</Text>
          </View>
        ) : (
          <View>
            <Animated.View entering={FadeInDown.duration(400)} style={s.heroCard}>
              <View style={s.heroTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.heroName}>{batch.name}</Text>
                  <View style={s.heroMetaRow}>
                    {batch.subject && <Text style={s.heroPill}>{batch.subject}</Text>}
                    {batch.className && <Text style={[s.heroPill, { backgroundColor: `${T.accent}15`, color: T.accent }]}>{batch.className}</Text>}
                  </View>
                </View>
                {batch.isRegistrationOpen && (
                  <View style={[s.statusPill, { backgroundColor: `${T.emerald}15` }]}>
                    <Text style={{ color: T.emerald, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>LIVE</Text>
                  </View>
                )}
              </View>

              <View style={s.heroStatsRow}>
                {batch.timeSlot && (
                  <View style={s.heroStat}>
                    <Clock size={16} color={T.textSec} style={{ marginRight: 6 }} />
                    <Text style={s.heroStatText}>{batch.timeSlot}</Text>
                  </View>
                )}
                <View style={s.heroStat}>
                  <Users size={16} color={T.textSec} style={{ marginRight: 6 }} />
                  <Text style={s.heroStatText}>{students.length} Students</Text>
                </View>
              </View>

              {/* Quick Actions mimicking web */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.quickActionsScroll}>
                <TouchableOpacity style={s.qActionBtn} onPress={() => setIsQrOpen(true)}>
                  <QrCode size={16} color={T.text} />
                  <Text style={s.qActionText}>QR Code</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.qActionBtn} onPress={() => handleDownload('pdf')} disabled={isDownloading}>
                  <Download size={16} color={T.text} />
                  <Text style={s.qActionText}>PDF</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.qActionBtn} onPress={() => handleDownload('stickers')} disabled={isDownloading}>
                  <Printer size={16} color={T.text} />
                  <Text style={s.qActionText}>Stickers</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.qActionBtn} onPress={() => setIsAddOpen(true)}>
                  <Send size={16} color={T.text} />
                  <Text style={s.qActionText}>Invite</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.qActionBtn} onPress={handleToggleRegistration}>
                  <Settings size={16} color={T.text} />
                  <Text style={s.qActionText}>{batch.isRegistrationOpen ? 'Close Reg' : 'Open Reg'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.qActionBtn} onPress={() => setIsFeeSettingsOpen(true)}>
                  <IndianRupee size={16} color={T.text} />
                  <Text style={s.qActionText}>Fee Cols</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.qActionBtn} onPress={async () => {
                  const url = `https://mathlogs.app/batch/${id}/kiosk`;
                  const canOpen = await Linking.canOpenURL(url);
                  if (canOpen) {
                    await Linking.openURL(url);
                  } else {
                    Alert.alert('Cannot Open', `Open this URL in your browser:\n${url}`);
                  }
                }}>
                  <MonitorPlay size={16} color={T.text} />
                  <Text style={s.qActionText}>Kiosk</Text>
                </TouchableOpacity>
              </ScrollView>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(400).delay(200)} style={s.studentsContainer}>
              <Text style={s.sectionTitle}>Students List</Text>
              <View style={s.studentsList}>
                {students.length === 0 ? (
                  <View style={{ padding: 40, alignItems: 'center', backgroundColor: T.white, borderRadius: 20 }}>
                    <Users size={40} color={T.textMuted} style={{ marginBottom: 12, opacity: 0.5 }} />
                    <Text style={{ color: T.textSec }}>No students in this batch.</Text>
                  </View>
                ) : (
                  students.map((student, i) => {
                    const genericPaid = student.fees?.filter((f: any) => f.status === 'PAID').reduce((sum: number, f: any) => sum + f.amount, 0) || 0;
                    let currentBuffer = genericPaid;
                    const sortedInsts = [...(batch.feeInstallments || [])]
                      .filter(inst => !inst.studentId || inst.studentId === student.id)
                      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                    const instPaidMap: Record<string, number> = {};
                    
                    sortedInsts.forEach(inst => {
                        const directPayments = student.feePayments?.filter((p: any) => p.installmentId === inst.id) || [];
                        let paid = directPayments.reduce((sum: number, p: any) => sum + p.amountPaid, 0);
                        const remaining = inst.amount - paid;
                        if (remaining > 0 && currentBuffer > 0) {
                            const coverage = Math.min(remaining, currentBuffer);
                            paid += coverage;
                            currentBuffer -= coverage;
                        }
                        instPaidMap[inst.id] = paid;
                    });

                    return (
                      <View key={student.id} style={s.studentCard}>
                        {/* Header Row */}
                        <View style={s.stHeader}>
                          <View style={{ flex: 1, paddingRight: 12 }}>
                            <Text style={s.stName}>{student.name}</Text>
                            {student.humanId && (
                              <View style={s.stIdPill}>
                                <Text style={s.stIdText}>{student.humanId}</Text>
                              </View>
                            )}
                          </View>
                          <View style={s.stActions}>
                             <TouchableOpacity style={s.stActionIcon} onPress={() => setViewMarksStudent(student)}>
                               <Eye size={18} color={T.text} />
                             </TouchableOpacity>
                             <TouchableOpacity 
                                style={[s.stActionIcon, { backgroundColor: `${T.blue}15` }]} 
                                onPress={() => { setShowCustomInvoice(student); setCustomInvoice({ name: '', amount: '', markAsPaid: false, existingInstallmentId: '' }); }}
                             >
                                <Receipt size={18} color={T.blue} />
                             </TouchableOpacity>
                             <TouchableOpacity style={[s.stActionIcon, { backgroundColor: `${T.emerald}15` }]} onPress={() => onCall(student.parentWhatsapp)}>
                                <Phone size={18} color={T.emerald} />
                             </TouchableOpacity>
                             <TouchableOpacity 
                                style={[s.stActionIcon, { backgroundColor: `${T.accent}15` }]} 
                                onPress={() => {
                                   setEditForm({ name: student.name, humanId: student.humanId || '', parentName: student.parentName, parentWhatsapp: student.parentWhatsapp, schoolName: student.schoolName || '' });
                                   setEditStudentId(student.id);
                                }}
                             >
                                <Edit2 size={18} color={T.accent} />
                             </TouchableOpacity>
                          </View>
                        </View>

                        {/* Info Grid */}
                        <View style={s.stInfoGrid}>
                          <View style={s.stInfoRow}>
                            <Book size={14} color={T.textMuted} style={{ width: 16 }} />
                            <Text style={s.stInfoText} numberOfLines={1}>{student.schoolName || <Text style={{ fontStyle: 'italic' }}>No School</Text>}</Text>
                          </View>
                          <View style={s.stInfoRow}>
                            <UserIcon size={14} color={T.textMuted} style={{ width: 16 }} />
                            <Text style={s.stInfoText} numberOfLines={1}>{student.parentName || 'Unknown Parent'}</Text>
                          </View>
                          <View style={s.stInfoRow}>
                            <FileText size={14} color={T.accent} style={{ width: 16 }} />
                            <Text style={[s.stInfoText, { color: T.accent, fontWeight: '700' }]}>Avg: {getStudentAverage(student)} / 10</Text>
                          </View>
                        </View>

                        {/* Installments */}
                        {batch.feeInstallments && batch.feeInstallments.length > 0 && (
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.stFeesScroll}>
                            {sortedInsts.map(inst => {
                              const paidAmount = instPaidMap[inst.id] || 0;
                              const isFullyPaid = paidAmount >= inst.amount;
                              const isPartiallyPaid = paidAmount > 0 && !isFullyPaid;

                              return (
                                <View key={inst.id} style={[
                                  s.instCol,
                                  isFullyPaid && s.instColPaid,
                                  isPartiallyPaid && s.instColPartial
                                ]}>
                                  <View style={[
                                    s.instDotOuter,
                                    isFullyPaid && s.instDotOuterPaid,
                                    isPartiallyPaid && s.instDotOuterPartial
                                  ]}>
                                    {isFullyPaid && <View style={s.instDotInner} />}
                                    {isPartiallyPaid && <Text style={{ fontSize: 8, fontWeight: '800', color: T.amber }}>P</Text>}
                                  </View>
                                  <View>
                                    <Text style={s.instName}>{inst.name}</Text>
                                    {isPartiallyPaid ? (
                                      <Text style={s.instDue}>Due: ₹{inst.amount - paidAmount}</Text>
                                    ) : (
                                      <Text style={s.instAmount}>₹{inst.amount}</Text>
                                    )}
                                  </View>
                                </View>
                              );
                            })}
                          </ScrollView>
                        )}
                      </View>
                    );
                  })
                )}
              </View>
            </Animated.View>
          </View>
        )}
      </ScrollView>

      {/* Invite Student Modal */}
      <Modal visible={isAddOpen} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <KeyboardAvoidingView style={s.modalContent} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={s.modalHeader}>
              <View>
                 <Text style={s.modalTitle}>Invite Student</Text>
                 <Text style={s.modalSub}>Send a secure registration link via WhatsApp.</Text>
              </View>
              <TouchableOpacity onPress={() => setIsAddOpen(false)} style={s.modalClose}><X size={20} color={T.text}/></TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }}>
              <Text style={s.inputLabel}>Student's WhatsApp</Text>
              <TextInput 
                 style={s.input} 
                 placeholder="10-digit Number" 
                 keyboardType="phone-pad" 
                 maxLength={10}
                 value={inviteWhatsapp} 
                 onChangeText={setInviteWhatsapp} 
              />
              <BrandButton title="Send Invite Link" onPress={handleAddSubmit} style={{ marginTop: 24, marginBottom: 40 }} />
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Edit Student Modal */}
      <Modal visible={!!editStudentId} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <KeyboardAvoidingView style={s.modalContent} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Edit Student</Text>
              <TouchableOpacity onPress={() => setEditStudentId(null)} style={s.modalClose}><X size={20} color={T.text}/></TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }}>
              <Text style={s.inputLabel}>Student Name *</Text>
              <TextInput style={s.input} placeholder="e.g. Rahul Kumar" value={editForm.name} onChangeText={t => setEditForm({...editForm, name: t})} />
              
              <Text style={s.inputLabel}>Student ID</Text>
              <TextInput style={s.input} placeholder="e.g. STD001" value={editForm.humanId} onChangeText={t => setEditForm({...editForm, humanId: t})} />

              <Text style={s.inputLabel}>Parent Name</Text>
              <TextInput style={s.input} placeholder="e.g. Mr. Kumar" value={editForm.parentName} onChangeText={t => setEditForm({...editForm, parentName: t})} />

              <Text style={s.inputLabel}>Parent WhatsApp *</Text>
              <TextInput style={s.input} placeholder="e.g. 9876543210" keyboardType="phone-pad" value={editForm.parentWhatsapp} onChangeText={t => setEditForm({...editForm, parentWhatsapp: t})} />

              <Text style={s.inputLabel}>School Name</Text>
              <TextInput style={s.input} placeholder="e.g. DPS" value={editForm.schoolName} onChangeText={t => setEditForm({...editForm, schoolName: t})} />

              <BrandButton title="Save Changes" onPress={handleEditSubmit} style={{ marginTop: 12, marginBottom: 40 }} />
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* View Marks Modal */}
      <Modal visible={!!viewMarksStudent} animationType="fade" transparent>
        <View style={s.modalOverlayDark}>
          <View style={[s.modalContent, { maxHeight: '70%', height: 'auto', marginTop: 'auto' }]}>
            <View style={s.modalHeader}>
              <View>
                 <Text style={s.modalTitle}>Performance</Text>
                 <Text style={s.modalSub}>{viewMarksStudent?.name}</Text>
              </View>
              <TouchableOpacity onPress={() => setViewMarksStudent(null)} style={s.modalClose}><X size={20} color={T.text}/></TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }}>
              {viewMarksStudent?.marks?.length === 0 ? (
                 <Text style={{textAlign: 'center', color: T.textMuted, marginTop: 40}}>No marks recorded yet.</Text>
              ) : (
                 viewMarksStudent?.marks?.map((m: any) => (
                    <View key={m.id} style={s.markRow}>
                       <View>
                          <Text style={s.markName}>{m.test.name}</Text>
                          <Text style={s.markMax}>Max: {m.test.maxMarks}</Text>
                       </View>
                       <Text style={s.markScore}>{m.score}</Text>
                    </View>
                 ))
              )}
              <View style={{height: 40}}/>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* QR Code Modal */}
      <Modal visible={isQrOpen} animationType="fade" transparent>
        <View style={s.modalOverlayDark}>
          <View style={[s.modalContent, { maxHeight: '70%', height: 'auto', marginTop: 'auto', alignItems: 'center', paddingBottom: 40 }]}>
            <View style={[s.modalHeader, { width: '100%' }]}>
              <Text style={s.modalTitle}>Batch QR Code</Text>
              <TouchableOpacity onPress={() => setIsQrOpen(false)} style={s.modalClose}><X size={20} color={T.text}/></TouchableOpacity>
            </View>
            <View style={{ padding: 40, alignItems: 'center' }}>
              <QRCode
                value={`mathlogs://batch/${id}`}
                size={240}
                color={T.accent}
                backgroundColor={T.white}
              />
              <Text style={{ marginTop: 24, fontSize: 16, color: T.textSec, textAlign: 'center' }}>
                Scan to join {batch?.name}
              </Text>
            </View>
          </View>
        </View>
      </Modal>
      {/* Custom Invoice Modal */}
      <Modal visible={!!showCustomInvoice} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <KeyboardAvoidingView style={s.modalContent} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={s.modalHeader}>
              <View>
                 <Text style={s.modalTitle}>Custom Invoice</Text>
                 <Text style={s.modalSub}>For {showCustomInvoice?.name}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowCustomInvoice(null)} style={s.modalClose}><X size={20} color={T.text}/></TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }}>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                 <TouchableOpacity 
                   style={[s.tabBtn, !customInvoice.existingInstallmentId && s.tabBtnActive]} 
                   onPress={() => setCustomInvoice({ ...customInvoice, existingInstallmentId: '' })}
                 >
                    <Text style={[s.tabBtnText, !customInvoice.existingInstallmentId && s.tabBtnTextActive]}>New Custom</Text>
                 </TouchableOpacity>
                 <TouchableOpacity 
                   style={[s.tabBtn, !!customInvoice.existingInstallmentId && s.tabBtnActive]} 
                   onPress={() => setCustomInvoice({ ...customInvoice, existingInstallmentId: invoiceTemplates[0]?.id || '' })}
                 >
                    <Text style={[s.tabBtnText, !!customInvoice.existingInstallmentId && s.tabBtnTextActive]}>Existing</Text>
                 </TouchableOpacity>
              </View>

              {customInvoice.existingInstallmentId ? (
                <View>
                   <Text style={s.inputLabel}>Select Installment</Text>
                   {/* In a real app we'd use a picker, but we can list them as buttons for now */}
                   {invoiceTemplates.map(inst => (
                     <TouchableOpacity 
                       key={inst.id} 
                       style={[s.instSelectBtn, customInvoice.existingInstallmentId === inst.id && s.instSelectBtnActive]}
                       onPress={() => setCustomInvoice({ ...customInvoice, existingInstallmentId: inst.id })}
                     >
                       <Text style={[s.instSelectText, customInvoice.existingInstallmentId === inst.id && { color: T.white }]}>{inst.name} (₹{inst.amount})</Text>
                     </TouchableOpacity>
                   ))}
                </View>
              ) : (
                <View>
                  <Text style={s.inputLabel}>Invoice Name</Text>
                  <TextInput 
                     style={s.input} 
                     placeholder="e.g. Study Material" 
                     value={customInvoice.name} 
                     onChangeText={t => setCustomInvoice({...customInvoice, name: t})} 
                  />
                  <Text style={s.inputLabel}>Amount (₹)</Text>
                  <TextInput 
                     style={s.input} 
                     placeholder="e.g. 500" 
                     keyboardType="numeric"
                     value={customInvoice.amount} 
                     onChangeText={t => setCustomInvoice({...customInvoice, amount: t})} 
                  />
                </View>
              )}

              <TouchableOpacity 
                style={s.checkboxRow}
                onPress={() => setCustomInvoice({...customInvoice, markAsPaid: !customInvoice.markAsPaid})}
              >
                <View style={[s.checkbox, customInvoice.markAsPaid && s.checkboxActive]}>
                   {customInvoice.markAsPaid && <Check size={12} color={T.white} />}
                </View>
                <Text style={s.checkboxLabel}>Mark as Paid immediately</Text>
              </TouchableOpacity>

              <BrandButton title="Create Invoice" onPress={handleCreateCustomInvoice} style={{ marginTop: 24, marginBottom: 40 }} />
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
      {/* Batch Settings Modal */}
      <Modal visible={isBatchSettingsOpen} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <KeyboardAvoidingView style={s.modalContent} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Batch Settings</Text>
              <TouchableOpacity onPress={() => setIsBatchSettingsOpen(false)} style={s.modalClose}><X size={20} color={T.text}/></TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }}>
              <Text style={s.inputLabel}>Batch Name *</Text>
              <TextInput style={s.input} placeholder="e.g. Morning Batch" value={batchForm.name} onChangeText={t => setBatchForm({...batchForm, name: t})} />
              
              <Text style={s.inputLabel}>Subject</Text>
              <TextInput style={s.input} placeholder="e.g. Mathematics" value={batchForm.subject} onChangeText={t => setBatchForm({...batchForm, subject: t})} />

              <Text style={s.inputLabel}>Class</Text>
              <TextInput style={s.input} placeholder="e.g. 10th" value={batchForm.className} onChangeText={t => setBatchForm({...batchForm, className: t})} />

              <Text style={s.inputLabel}>Total Fee (₹)</Text>
              <TextInput style={s.input} placeholder="e.g. 15000" keyboardType="numeric" value={batchForm.feeAmount} onChangeText={t => setBatchForm({...batchForm, feeAmount: t})} />

              <Text style={s.inputLabel}>Time Slot</Text>
              <TextInput style={s.input} placeholder="e.g. 4:00 PM - 5:00 PM" value={batchForm.timeSlot} onChangeText={t => setBatchForm({...batchForm, timeSlot: t})} />

              <Text style={s.inputLabel}>WhatsApp Group Link</Text>
              <TextInput style={s.input} placeholder="https://chat.whatsapp.com/..." value={batchForm.whatsappGroupLink} onChangeText={t => setBatchForm({...batchForm, whatsappGroupLink: t})} />

              <BrandButton title="Save Changes" onPress={handleBatchSettingsSave} style={{ marginTop: 24, marginBottom: 40 }} />
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Fee Settings Modal */}
      <Modal visible={isFeeSettingsOpen && !editInstallment} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <KeyboardAvoidingView style={s.modalContent} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Fee Columns</Text>
              <TouchableOpacity onPress={() => setIsFeeSettingsOpen(false)} style={s.modalClose}><X size={20} color={T.text}/></TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }}>
              <View style={{ marginBottom: 24 }}>
                <Text style={[s.sectionTitle, { marginLeft: 0 }]}>Existing Installments</Text>
                {batch?.feeInstallments?.filter(inst => !inst.studentId).length === 0 ? (
                  <Text style={{ color: T.textMuted }}>No installments configured.</Text>
                ) : (
                  batch?.feeInstallments?.filter(inst => !inst.studentId).map(inst => (
                    <View key={inst.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor: T.white, borderRadius: 12, borderWidth: 1, borderColor: T.border, marginBottom: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '700', color: T.text }}>{inst.name}</Text>
                        <Text style={{ fontWeight: '600', color: T.textSec, fontSize: 13 }}>₹{inst.amount}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => setEditInstallment({ id: inst.id, name: inst.name, amount: String(inst.amount) })}
                        style={{ padding: 8, backgroundColor: `${T.blue}12`, borderRadius: 10 }}
                      >
                        <Edit2 size={15} color={T.blue} />
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>

              <Text style={[s.sectionTitle, { marginLeft: 0 }]}>Add New Installment</Text>
              <Text style={s.inputLabel}>Installment Name</Text>
              <TextInput style={s.input} placeholder="e.g. First Installment" value={feeForm.name} onChangeText={t => setFeeForm({...feeForm, name: t})} />
              
              <Text style={s.inputLabel}>Amount (₹)</Text>
              <TextInput style={s.input} placeholder="e.g. 5000" keyboardType="numeric" value={feeForm.amount} onChangeText={t => setFeeForm({...feeForm, amount: t})} />

              <BrandButton title="Create Installment" onPress={handleFeeInstallmentAdd} style={{ marginTop: 24, marginBottom: 40 }} />
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Edit Installment Modal ── */}
      <Modal visible={!!editInstallment} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditInstallment(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: T.border }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: T.text }}>Edit Installment</Text>
              <TouchableOpacity onPress={() => setEditInstallment(null)} style={{ padding: 8 }}>
                <X size={22} color={T.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 20 }}>
              <Text style={s.inputLabel}>Name</Text>
              <TextInput
                style={s.input}
                value={editInstallment?.name || ''}
                onChangeText={t => setEditInstallment(e => e ? { ...e, name: t } : null)}
                placeholder="Installment name"
              />
              <Text style={s.inputLabel}>Amount (₹)</Text>
              <TextInput
                style={s.input}
                value={editInstallment?.amount || ''}
                onChangeText={t => setEditInstallment(e => e ? { ...e, amount: t } : null)}
                keyboardType="numeric"
                placeholder="e.g. 5000"
              />
              <BrandButton title="Save Changes" onPress={handleFeeInstallmentEdit} style={{ marginTop: 24, marginBottom: 40 }} />
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 56 },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -12 },
  navTitle: { fontSize: 17, fontWeight: '700', color: T.text, flex: 1, textAlign: 'center' },
  navRight: { width: 44, alignItems: 'flex-end', justifyContent: 'center' },
  headerActionBtn: { padding: 8 },
  scrollContent: { padding: 16, paddingBottom: 120 },
  
  empty: { padding: 40, alignItems: 'center', justifyContent: 'center', marginTop: 100 },
  emptyTitle: { fontSize: 18, color: T.textMuted, fontWeight: '700', marginTop: 12 },

  heroCard: {
    backgroundColor: T.white, borderRadius: 24, padding: 20,
    borderWidth: 1, borderColor: T.border, marginBottom: 16,
    ...Platform.select({
      ios: { shadowColor: T.shadow, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 1, shadowRadius: 24 },
      android: { elevation: 4 },
    }),
  },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  heroName: { fontSize: 24, fontWeight: '800', color: T.text, marginBottom: 8, letterSpacing: -0.5 },
  heroMetaRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  heroPill: { backgroundColor: T.bg, color: T.textSec, fontSize: 11, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  statusPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  
  heroStatsRow: { flexDirection: 'row', gap: 16, marginBottom: 20 },
  heroStat: { flexDirection: 'row', alignItems: 'center' },
  heroStatText: { fontSize: 13, color: T.textSec, fontWeight: '600' },

  quickActionsScroll: { gap: 8 },
  qActionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: T.bg, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, gap: 6, borderWidth: 1, borderColor: T.border },
  qActionText: { fontSize: 13, fontWeight: '700', color: T.text },

  financeContainer: { marginBottom: 16 },
  financeGrid: { flexDirection: 'row', gap: 12 },
  finCard: {
    flex: 1, backgroundColor: T.white, padding: 16, borderRadius: 20,
    borderWidth: 1, borderColor: T.border, borderLeftWidth: 4,
    ...Platform.select({
      ios: { shadowColor: T.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 12 },
      android: { elevation: 2 },
    }),
  },
  finLabel: { fontSize: 11, color: T.textSec, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  finValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },

  sectionTitle: { fontSize: 18, fontWeight: '800', color: T.text, marginBottom: 12, marginLeft: 4, letterSpacing: -0.3 },
  studentsContainer: { marginBottom: 24 },
  studentsList: { gap: 12 },
  studentCard: {
    backgroundColor: T.white, borderRadius: 24, padding: 16,
    borderWidth: 1, borderColor: T.border,
    ...Platform.select({
      ios: { shadowColor: T.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 12 },
      android: { elevation: 2 },
    }),
  },
  stHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  stName: { fontSize: 16, fontWeight: '700', color: T.text, marginBottom: 6 },
  stIdPill: { alignSelf: 'flex-start', backgroundColor: T.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: T.border },
  stIdText: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 10, color: T.textSec, fontWeight: '600' },
  
  stActions: { flexDirection: 'row', gap: 6 },
  stActionIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center' },

  stInfoGrid: { gap: 6, marginBottom: 12 },
  stInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stInfoText: { fontSize: 13, color: T.textSec, flex: 1 },

  stFeesScroll: { gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: T.border, marginLeft: -16, paddingLeft: 16, paddingRight: 16 },
  instCol: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: T.bg, borderRadius: 12, borderWidth: 1, borderColor: T.border },
  instColPaid: { backgroundColor: T.white, borderColor: T.border },
  instColPartial: { backgroundColor: `${T.amber}10`, borderColor: `${T.amber}30` },
  
  instDotOuter: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: T.textMuted, alignItems: 'center', justifyContent: 'center' },
  instDotOuterPaid: { borderColor: T.text, backgroundColor: T.white },
  instDotOuterPartial: { borderColor: T.amber, backgroundColor: `${T.amber}20` },
  instDotInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: T.text },

  instName: { fontSize: 12, fontWeight: '700', color: T.text, marginBottom: 2 },
  instAmount: { fontSize: 10, color: T.textSec, fontWeight: '600' },
  instDue: { fontSize: 10, color: T.amber, fontWeight: '800' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalOverlayDark: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: T.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: T.border, backgroundColor: T.white, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: T.text },
  modalSub: { fontSize: 13, color: T.textSec, marginTop: 4 },
  modalClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center' },
  inputLabel: { fontSize: 13, fontWeight: '700', color: T.textSec, marginBottom: 8, marginTop: 12, textTransform: 'uppercase' },
  input: { backgroundColor: T.white, borderWidth: 1, borderColor: T.border, borderRadius: 12, paddingHorizontal: 16, height: 50, fontSize: 16, color: T.text },
  
  markRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: T.white, padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: T.border },
  markName: { fontSize: 15, fontWeight: '700', color: T.text },
  markMax: { fontSize: 12, color: T.textSec, marginTop: 4 },
  markScore: { fontSize: 24, fontWeight: '800', color: T.accent },

  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: T.white, borderRadius: 12, borderWidth: 1, borderColor: T.border },
  tabBtnActive: { backgroundColor: T.text, borderColor: T.text },
  tabBtnText: { fontSize: 14, fontWeight: '700', color: T.textSec },
  tabBtnTextActive: { color: T.white },

  instSelectBtn: { padding: 16, backgroundColor: T.white, borderRadius: 12, borderWidth: 1, borderColor: T.border, marginBottom: 8 },
  instSelectBtnActive: { backgroundColor: T.text, borderColor: T.text },
  instSelectText: { fontSize: 14, fontWeight: '700', color: T.text },

  checkboxRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 12, paddingVertical: 8 },
  checkbox: { width: 24, height: 24, borderRadius: 8, borderWidth: 2, borderColor: T.border, alignItems: 'center', justifyContent: 'center', backgroundColor: T.white },
  checkboxActive: { backgroundColor: T.text, borderColor: T.text },
  checkboxLabel: { fontSize: 14, color: T.text, fontWeight: '600' }
});
