import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Modal, TextInput, TouchableOpacity, Alert, Platform } from 'react-native';

interface Props {
  visible: boolean;
  currentRate: number;
  onClose: () => void;
  onSave: (newRate: number) => Promise<void>;
}

export const EditRateModal: React.FC<Props> = ({ visible, currentRate, onClose, onSave }) => {
  const [rateInput, setRateInput] = useState('');

  useEffect(() => {
    setRateInput(currentRate.toString());
  }, [currentRate, visible]);

  const handleSave = async () => {
    const parsed = parseFloat(rateInput);
    if (isNaN(parsed) || parsed <= 0) {
      Platform.OS === 'web' ? window.alert('Enter a valid hourly rate.') : Alert.alert('Invalid Rate', 'Enter a valid rate.');
      return;
    }
    await onSave(parsed);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent={true}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Update Hourly Rate</Text>
          <Text style={styles.modalSub}>Adjust base wage to recalculate all pay projections.</Text>

          <TextInput
            style={[styles.textInput, { marginVertical: 14 }]}
            keyboardType="numeric"
            value={rateInput}
            onChangeText={setRateInput}
            placeholder="e.g. 18.10"
          />

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity style={[styles.btn, { backgroundColor: '#94a3b8' }]} onPress={onClose}>
              <Text style={styles.btnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, { backgroundColor: '#2563eb' }]} onPress={handleSave}>
              <Text style={styles.btnText}>Save</Text>
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
  textInput: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 12, fontSize: 16, backgroundColor: '#f8fafc', color: '#0f172a' },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700' },
});