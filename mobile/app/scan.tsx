import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput, Platform, KeyboardAvoidingView, ScrollView, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, X, Check, ChevronDown } from 'lucide-react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import api from '../services/api';

const T = {
  bg: '#000000', white: '#FFFFFF', text: '#1D1D1F',
  textSec: '#86868B', textMuted: '#AEAEB2', accent: '#111827', emerald: '#10b981',
  blue: '#3b82f6', red: '#ef4444', border: 'rgba(255,255,255,0.2)'
};

interface StudentData {
  id: string;
  name: string;
  humanId: string | null;
  batch?: { name: string };
  marks?: Array<{ testId: string; score: number }>;
}

interface ScanTest {
  id: string;
  name: string;
  subject: string;
  maxMarks: number;
}

export default function GlobalScanScreen() {
  const router = useRouter();
  const cameraRef = React.useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [student, setStudent] = useState<StudentData | null>(null);
  const [score, setScore] = useState('');
  const [existingMark, setExistingMark] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);

  const [tests, setTests] = useState<ScanTest[]>([]);
  const [selectedTestId, setSelectedTestId] = useState<string>('');
  const [isTestDropdownOpen, setIsTestDropdownOpen] = useState(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission]);

  useEffect(() => {
    // Fetch tests
    api.get('/tests').then(res => {
      setTests(res.data);
    }).catch(() => {
      Alert.alert('Error', 'Failed to fetch tests.');
    });
  }, []);

  const selectedTest = tests.find(t => t.id === selectedTestId);

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scanned || processing || !selectedTestId) return;
    setScanned(true);
    setProcessing(true);

    let capturedBase64 = '';
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.4 });
        if (photo && photo.base64) {
          capturedBase64 = photo.base64;
        }
      } catch (e) {
        console.warn("Failed to capture image for OCR", e);
      }
    }

    try {
      const res = await api.get(`/students/lookup/${encodeURIComponent(data)}?testId=${selectedTestId}`);
      const st = res.data;
      const existing = st.marks?.find((m: any) => m.testId === selectedTestId);
      
      // Show modal immediately — if we have a photo, lock with spinner from the start
      if (capturedBase64) setOcrLoading(true);
      setStudent(st);
      if (existing) {
        setExistingMark(existing.score);
      }

      // Attempt OCR — modal already shows spinner
      if (capturedBase64) {
        try {
          const ocrRes = await api.post('/scan-ocr', {
            image: `data:image/jpeg;base64,${capturedBase64}`,
            maxMarks: selectedTest?.maxMarks
          });
          if (ocrRes.data && ocrRes.data.score && !isNaN(Number(ocrRes.data.score))) {
            setScore(String(ocrRes.data.score));
          }
        } catch (ocrErr) {
          console.warn("OCR failed:", ocrErr);
        } finally {
          setOcrLoading(false);
        }
      }

    } catch (e: any) {
      Alert.alert('Scan Failed', e.response?.data?.error || 'Student not found.', [
        { text: 'OK', onPress: () => { setScanned(false); setProcessing(false); } }
      ]);
    } finally {
      setProcessing(false);
    }
  };

  const handleSave = async () => {
    if (!student || !score || !selectedTestId || ocrLoading) return;
    
    try {
      setProcessing(true);
      await api.post('/marks', {
        testId: selectedTestId,
        studentId: student.id,
        score: Number(score)
      });
      // Success, reset for next scan
      setStudent(null);
      setScore('');
      setExistingMark(null);
      setScanned(false);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to save marks.');
    } finally {
      setProcessing(false);
    }
  };

  if (!permission) return <View style={s.container} />;
  if (!permission.granted) return (
    <SafeAreaView style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <Text style={{ color: T.white }}>No access to camera</Text>
      <TouchableOpacity onPress={requestPermission} style={{ marginTop: 20 }}>
         <Text style={{ color: T.blue }}>Grant Permission</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 20 }}>
         <Text style={{ color: T.textMuted }}>Go Back</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );

  return (
    <View style={s.container}>
      <CameraView 
        ref={cameraRef}
        style={StyleSheet.absoluteFillObject}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ["qr"]
        }}
      />

      <SafeAreaView edges={['top']} style={s.overlay}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <ChevronLeft size={28} color={T.white} />
          </TouchableOpacity>
          <View style={s.titleWrap}>
            <Text style={s.title}>Scan Marks</Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, marginTop: 16, zIndex: 100 }}>
          <TouchableOpacity 
            style={s.testDropdownBtn}
            onPress={() => setIsTestDropdownOpen(!isTestDropdownOpen)}
          >
            <Text style={[s.testDropdownText, !selectedTest && { color: T.textMuted }]}>
              {selectedTest ? `${selectedTest.name} (${selectedTest.subject})` : 'Select Test First'}
            </Text>
            <ChevronDown size={20} color={T.white} />
          </TouchableOpacity>

          {isTestDropdownOpen && (
            <View style={s.testDropdownList}>
              <ScrollView style={{ maxHeight: 200 }}>
                {tests.map(t => (
                  <TouchableOpacity 
                    key={t.id} 
                    style={s.testDropdownItem}
                    onPress={() => {
                      setSelectedTestId(t.id);
                      setIsTestDropdownOpen(false);
                    }}
                  >
                    <Text style={[s.testDropdownItemText, selectedTestId === t.id && { color: T.emerald }]}>{t.name} - {t.subject}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        <View style={s.targetArea}>
           <View style={s.targetBox}>
              <View style={[s.corner, s.topLeft]} />
              <View style={[s.corner, s.topRight]} />
              <View style={[s.corner, s.bottomLeft]} />
              <View style={[s.corner, s.bottomRight]} />
           </View>
           <Text style={s.targetText}>
             {selectedTest ? 'Align full sticker (QR + Marks) in frame' : 'Select a test to start scanning'}
           </Text>
        </View>
      </SafeAreaView>

      {student && selectedTest && (
        <Animated.View entering={SlideInDown.duration(300)} style={s.modalContainer}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={s.modalContent}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Enter Marks</Text>
                <TouchableOpacity onPress={() => { setStudent(null); setScore(''); setScanned(false); setProcessing(false); }}>
                  <X size={24} color={T.textSec} />
                </TouchableOpacity>
              </View>

              <View style={s.stInfo}>
                 <Text style={s.stName}>{student.name}</Text>
                 <Text style={s.stBatch}>{student.batch?.name || 'N/A'}</Text>
              </View>

              {existingMark !== null && (
                <View style={s.warnBox}>
                   <Text style={s.warnText}>Already scored: {existingMark}</Text>
                </View>
              )}

              <View style={s.inputWrap}>
                {ocrLoading ? (
                  <View style={s.ocrLoadingWrap}>
                    <ActivityIndicator size="large" color={T.emerald} />
                    <Text style={s.ocrLoadingText}>Reading marks...</Text>
                    <Text style={s.ocrLoadingHint}>Please wait, do not enter marks</Text>
                  </View>
                ) : (
                  <>
                    <TextInput
                      style={s.scoreInput}
                      placeholder="0"
                      placeholderTextColor={T.textMuted}
                      keyboardType="numeric"
                      autoFocus
                      value={score}
                      onChangeText={setScore}
                    />
                    <Text style={s.maxMarksText}>/ {selectedTest.maxMarks}</Text>
                  </>
                )}
              </View>

              <TouchableOpacity 
                style={[s.saveBtn, (processing || ocrLoading) && { opacity: 0.5 }]} 
                onPress={handleSave}
                disabled={processing || !score || ocrLoading}
              >
                <Text style={s.saveBtnText}>{processing ? 'Saving...' : 'Save Marks'}</Text>
                {!processing && <Check size={20} color={T.white} />}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  overlay: { flex: 1, justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.4)' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 56 },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 22 },
  titleWrap: { flex: 1, alignItems: 'center', marginRight: 44 },
  title: { color: T.white, fontSize: 18, fontWeight: '700' },
  
  testDropdownBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  testDropdownText: { color: T.white, fontSize: 16, fontWeight: '600' },
  testDropdownList: { position: 'absolute', top: 60, left: 16, right: 16, backgroundColor: T.white, borderRadius: 12, paddingVertical: 8, maxHeight: 200 },
  testDropdownItem: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.border },
  testDropdownItemText: { fontSize: 15, fontWeight: '600', color: T.text },

  targetArea: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 100 },
  targetBox: { width: 330, height: 178, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)', borderRadius: 24, position: 'relative' },
  corner: { position: 'absolute', width: 32, height: 32, borderColor: T.white },
  topLeft: { top: -2, left: -2, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 24 },
  topRight: { top: -2, right: -2, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 24 },
  bottomLeft: { bottom: -2, left: -2, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 24 },
  bottomRight: { bottom: -2, right: -2, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 24 },
  targetText: { color: T.white, marginTop: 40, fontSize: 14, fontWeight: '500', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, overflow: 'hidden' },

  modalContainer: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: T.white, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: T.text },
  
  stInfo: { backgroundColor: '#F5F5F7', padding: 16, borderRadius: 16, marginBottom: 16 },
  stName: { fontSize: 18, fontWeight: '700', color: T.text, marginBottom: 4 },
  stBatch: { fontSize: 13, color: T.textSec, fontWeight: '600' },
  
  warnBox: { backgroundColor: '#FEF2F2', padding: 12, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#FECACA' },
  warnText: { color: T.red, fontWeight: '600', textAlign: 'center', fontSize: 14 },

  inputWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 24, gap: 12 },
  scoreInput: { fontSize: 56, fontWeight: '900', color: T.text, textAlign: 'center', minWidth: 100 },
  maxMarksText: { fontSize: 24, color: T.textMuted, fontWeight: '700', marginTop: 16 },

  saveBtn: { backgroundColor: T.emerald, height: 60, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, shadowColor: T.emerald, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 4 },
  saveBtnText: { color: T.white, fontSize: 18, fontWeight: '700' },

  ocrLoadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 10 },
  ocrLoadingText: { fontSize: 20, fontWeight: '700', color: T.text },
  ocrLoadingHint: { fontSize: 13, color: T.textSec, fontWeight: '500' },
});
