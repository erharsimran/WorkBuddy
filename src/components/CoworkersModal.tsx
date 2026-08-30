import React, { useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
  Platform,
} from 'react-native';
import { ShiftDbRow, CoworkerShift } from '../types';

interface Props {
  shift: ShiftDbRow | null;
  onClose: () => void;
}

function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function getShiftTag(startTime: string, endTime: string): { tag: string; type: 'open' | 'mid' | 'close' | 'other' } {
  const startMin = parseTimeToMinutes(startTime);
  const endMin = parseTimeToMinutes(endTime);
  if (startMin >= 330 && startMin <= 420) return { tag: 'Opening', type: 'open' };
  if (endMin >= 1230 || (endMin < startMin && endMin <= 180)) return { tag: 'Closing', type: 'close' };
  if (startMin < 600 && endMin >= 1020 && endMin <= 1200) return { tag: 'Mid Shift', type: 'mid' };
  return { tag: 'Regular', type: 'other' };
}

export const CoworkersModal: React.FC<Props> = ({ shift, onClose }) => {
  const sortedCoworkers = useMemo(() => {
    if (!shift?.coworkers) return [];
    return [...shift.coworkers].sort((a, b) => {
      const timeA = typeof a === 'object' && a?.startTime ? parseTimeToMinutes(a.startTime) : 0;
      const timeB = typeof b === 'object' && b?.startTime ? parseTimeToMinutes(b.startTime) : 0;
      return timeA - timeB;
    });
  }, [shift]);

  const handleMakeCall = (phone: string, name: string) => {
    const cleanPhone = phone.replace(/[^0-9+]/g, '');
    if (!cleanPhone) {
      const msg = `No valid phone number found for ${name}.`;
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Unavailable', msg);
      return;
    }
    Linking.openURL(`tel:${cleanPhone}`);
  };

  const handleSendSMS = (phone: string, name: string) => {
    const cleanPhone = phone.replace(/[^0-9+]/g, '');
    if (!cleanPhone) {
      const msg = `No valid phone number found for ${name}.`;
      Platform.OS === 'web' ? window.alert(msg) : Alert.alert('Unavailable', msg);
      return;
    }
    Linking.openURL(`sms:${cleanPhone}`);
  };

  return (
    <Modal visible={!!shift} animationType="fade" transparent={true}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Daily Coworker Schedule</Text>
          <Text style={styles.modalSub}>{shift?.date || ''}</Text>

          <ScrollView style={{ maxHeight: 380, marginVertical: 14 }}>
            {sortedCoworkers.length > 0 ? (
              sortedCoworkers.map((c: CoworkerShift | string, idx: number) => {
                const isObject = typeof c === 'object' && c !== null;
                const name = isObject ? c.name : c;
                const startTime = isObject ? c.startTime : '';
                const endTime = isObject ? c.endTime : '';
                const phone = isObject ? c.phone : null;
                const timeRange = startTime && endTime ? `${startTime} - ${endTime}` : null;
                const shiftMeta = getShiftTag(startTime, endTime);

                return (
                  <View key={idx} style={styles.coworkerCard}>
                    <View style={styles.coworkerTopRow}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={styles.coworkerNameText}>{name}</Text>
                        {timeRange ? <Text style={styles.coworkerSubTime}>⏰ {timeRange}</Text> : null}
                      </View>

                      {timeRange ? (
                        <View style={[styles.shiftTagBadge, styles[`${shiftMeta.type}Badge`]]}>
                          <Text style={[styles.shiftTagText, styles[`${shiftMeta.type}Text`]]}>
                            {shiftMeta.tag}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Direct Contact Actions */}
                    {phone ? (
                      <View style={styles.contactActionsRow}>
                        <TouchableOpacity
                          style={[styles.contactBtn, styles.callBtn]}
                          onPress={() => handleMakeCall(phone, name)}
                        >
                          <Text style={styles.callBtnText}>📞 Call</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.contactBtn, styles.smsBtn]}
                          onPress={() => handleSendSMS(phone, name)}
                        >
                          <Text style={styles.smsBtnText}>💬 SMS</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                );
              })
            ) : (
              <Text style={styles.noCoworkersText}>No other coworkers scheduled on this date.</Text>
            )}
          </ScrollView>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  modalSub: { fontSize: 13, color: '#64748b', marginTop: 2 },

  coworkerCard: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  coworkerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  coworkerNameText: { fontSize: 15, color: '#0f172a', fontWeight: '700' },
  coworkerSubTime: { fontSize: 12, color: '#64748b', fontWeight: '500', marginTop: 2 },

  shiftTagBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  shiftTagText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  openBadge: { backgroundColor: '#fef3c7' },
  openText: { color: '#b45309' },
  midBadge: { backgroundColor: '#e0e7ff' },
  midText: { color: '#4338ca' },
  closeBadge: { backgroundColor: '#fee2e2' },
  closeText: { color: '#b91c1c' },
  otherBadge: { backgroundColor: '#f1f5f9' },
  otherText: { color: '#475569' },

  contactActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  contactBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  callBtn: {
    backgroundColor: '#dcfce7',
    borderColor: '#bbf7d0',
  },
  callBtnText: {
    color: '#15803d',
    fontWeight: '700',
    fontSize: 12,
  },
  smsBtn: {
    backgroundColor: '#f1f5f9',
    borderColor: '#e2e8f0',
  },
  smsBtnText: {
    color: '#334155',
    fontWeight: '700',
    fontSize: 12,
  },

  noCoworkersText: { fontSize: 14, color: '#94a3b8', fontStyle: 'italic', paddingVertical: 8 },
  closeBtn: {
    backgroundColor: '#0f172a',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  closeBtnText: { color: '#fff', fontWeight: '700' },
});