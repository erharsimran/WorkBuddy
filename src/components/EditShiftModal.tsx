import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Modal, TextInput, TouchableOpacity, Alert, Platform } from 'react-native';
import { ShiftDbRow } from '../types';

interface Props {
  shift: ShiftDbRow | null;
  onClose: () => void;
  onSave: (updatedShift: ShiftDbRow) => Promise<void>;
}

function calculateDurationHours(start: string, end: string): number {
  try {
    const [sH, sM] = start.split(':').map(Number);
    const [eH, eM] = end.split(':').map(Number);
    if (isNaN(sH) || isNaN(sM) || isNaN(eH) || isNaN(eM)) return 0;
    let sMin = sH * 60 + sM;
    let eMin = eH * 60 + eM;
    if (eMin < sMin) eMin += 24 * 60;
    const diff = (eMin - sMin) / 60;
    return Number((diff > 5.5 ? diff - 0.5 : diff).toFixed(2));
  } catch {
    return 0;
  }
}

export const EditShiftModal: React.FC<Props> = ({ shift, onClose, onSave }) => {
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [hours, setHours] = useState('');

  useEffect(() => {
    if (shift) {
      setStartTime(shift.start_time);
      setEndTime(shift.end_time);
      setHours(shift.hours.toString());
    }
  }, [shift]);

  const handleStartTimeChange = (val: string) => {
    setStartTime(val);
    if (val.length === 5 && endTime.length === 5) {
      const autoHours = calculateDurationHours(val, endTime);
      if (autoHours > 0) setHours(autoHours.toString());
    }
  };

  const handleEndTimeChange = (val: string) => {
    setEndTime(val);
    if (startTime.length === 5 && val.length === 5) {
      const autoHours = calculateDurationHours(startTime, val);
      if (autoHours > 0) setHours(autoHours.toString());
    }
  };

  const handleSave = async () => {
    if (!shift) return;
    const parsedHours = parseFloat(hours);
    if (isNaN(parsedHours) || parsedHours <= 0) {
      Platform.OS === 'web' ? window.alert('Enter valid hours.') : Alert.alert('Invalid Hours', 'Enter valid hours.');
      return;
    }
    await onSave({ ...shift, start_time: startTime.trim(), end_time: endTime.trim(), hours: parsedHours });
    onClose();
  };

  return (
    <Modal visible={!!shift} animationType="fade" transparent={true}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Edit Shift Timing</Text>
          <Text style={styles.modalSub}>{shift?.date || ''}</Text>

          <Text style={styles.modalFieldLabel}>Start Time (HH:mm)</Text>
          <TextInput style={styles.textInput} value={startTime} onChangeText={handleStartTimeChange} placeholder="15:00" />

          <Text style={styles.modalFieldLabel}>End Time (HH:mm)</Text>
          <TextInput style={styles.textInput} value={endTime} onChangeText={handleEndTimeChange} placeholder="21:30" />

          <Text style={styles.modalFieldLabel}>Total Hours</Text>
          <TextInput style={styles.textInput} value={hours} onChangeText={setHours} keyboardType="numeric" placeholder="6.5" />

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <TouchableOpacity style={[styles.btn, { backgroundColor: '#94a3b8' }]} onPress={onClose}>
              <Text style={styles.btnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, { backgroundColor: '#2563eb' }]} onPress={handleSave}>
              <Text style={styles.btnText}>Save Shift</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  modalSub: { fontSize: 13, color: '#64748b', marginTop: 2 },
  modalFieldLabel: { fontSize: 13, fontWeight: '700', color: '#475569', marginTop: 12, marginBottom: 4 },
  textInput: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 12, fontSize: 16, backgroundColor: '#f8fafc', color: '#0f172a' },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700' },
});