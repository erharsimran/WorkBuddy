import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { ShiftDbRow } from '../types';
import { fetchShiftsByEmployeeId } from '../database/db';
import { EmployeeRecord } from './AdminTab';

interface Props {
  employee: EmployeeRecord | null;
  onClose: () => void;
}

type ShiftType = 'open' | 'mid' | 'close' | 'other';

function getOrdinalSuffix(day: number): string {
  if (day > 3 && day < 21) return `${day}th`;
  switch (day % 10) {
    case 1:  return `${day}st`;
    case 2:  return `${day}nd`;
    case 3:  return `${day}rd`;
    default: return `${day}th`;
  }
}

function formatShiftDate(dateStr: string) {
  if (!dateStr) return { formattedDate: '', isPast: false };
  const [year, month, day] = dateStr.split('-').map(Number);
  const shiftDate = new Date(year, month - 1, day);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const weekday = shiftDate.toLocaleDateString('en-US', { weekday: 'short' });
  const formattedDate = `${weekday}, ${getOrdinalSuffix(day)} ${monthNames[month - 1]}, ${year}`;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const isPast = shiftDate.getTime() < today.getTime();

  return { formattedDate, isPast };
}

function getShiftTag(startTime: string, endTime: string): { tag: string; type: ShiftType } {
  const [sH, sM] = (startTime || '').split(':').map(Number);
  const [eH, eM] = (endTime || '').split(':').map(Number);
  const startMin = (sH || 0) * 60 + (sM || 0);
  const endMin = (eH || 0) * 60 + (eM || 0);

  if (startMin >= 330 && startMin <= 420) return { tag: 'Opening', type: 'open' };
  if (endMin >= 1230 || (endMin < startMin && endMin <= 180)) return { tag: 'Closing', type: 'close' };
  if (startMin < 600 && endMin >= 1020 && endMin <= 1200) return { tag: 'Mid Shift', type: 'mid' };
  return { tag: 'Regular', type: 'other' };
}

export const EmployeeScheduleModal: React.FC<Props> = ({ employee, onClose }) => {
  const [shifts, setShifts] = useState<ShiftDbRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (employee) {
      setLoading(true);
      fetchShiftsByEmployeeId(employee.id)
        .then(setShifts)
        .finally(() => setLoading(false));
    } else {
      setShifts([]);
    }
  }, [employee]);

  const totalHours = shifts.reduce((sum, s) => sum + (Number(s.hours) || 0), 0);

  const shiftStyleMap: Record<ShiftType, { badge: object; text: object }> = {
    open: { badge: styles.openBadge, text: styles.openText },
    mid: { badge: styles.midBadge, text: styles.midText },
    close: { badge: styles.closeBadge, text: styles.closeText },
    other: { badge: styles.otherBadge, text: styles.otherText },
  };

  return (
    <Modal visible={!!employee} animationType="fade" transparent={true}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>{employee?.display_name}</Text>
              <Text style={styles.modalSub}>
                🏷️ {employee?.role_category || 'Staff'} • {employee?.full_name}
              </Text>
            </View>
            <View style={styles.totalBadge}>
              <Text style={styles.totalHoursText}>{totalHours.toFixed(1)} hrs</Text>
              <Text style={styles.totalShiftCount}>{shifts.length} shifts</Text>
            </View>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#2563eb" />
              <Text style={styles.loadingText}>Fetching shifts...</Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 380, marginVertical: 12 }}>
              {shifts.length === 0 ? (
                <Text style={styles.emptyText}>No shifts scheduled for this employee.</Text>
              ) : (
                shifts.map((shift) => {
                  const { formattedDate, isPast } = formatShiftDate(shift.date);
                  const isOff = shift.start_time === '00:00' || shift.hours === 0;
                  const shiftMeta = getShiftTag(shift.start_time, shift.end_time);

                  return (
                    <View key={shift.id} style={[styles.shiftRow, isPast && styles.pastShiftRow]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.dateText, isPast && styles.pastText]}>
                          {formattedDate}
                        </Text>
                        <Text style={styles.timeText}>
                          {isOff ? '🌴 Vacation / Off' : `⏰ ${shift.start_time} - ${shift.end_time}`}
                        </Text>
                      </View>

                      {!isOff && (
                        <View style={styles.badgeColumn}>
                          <Text style={styles.hoursBadge}>{shift.hours} hrs</Text>
                          <View style={[styles.tagBadge, shiftStyleMap[shiftMeta.type].badge]}>
                            <Text style={[styles.tagText, shiftStyleMap[shiftMeta.type].text]}>
                              {shiftMeta.tag}
                            </Text>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>
          )}

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
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  modalSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  totalBadge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'flex-end',
  },
  totalHoursText: { color: '#2563eb', fontWeight: '800', fontSize: 14 },
  totalShiftCount: { color: '#64748b', fontSize: 11, fontWeight: '600' },

  loadingContainer: { paddingVertical: 40, alignItems: 'center' },
  loadingText: { marginTop: 8, color: '#64748b', fontSize: 13 },

  shiftRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  pastShiftRow: { opacity: 0.6 },
  dateText: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  pastText: { color: '#64748b' },
  timeText: { fontSize: 12, color: '#475569', marginTop: 2 },

  badgeColumn: { alignItems: 'flex-end', gap: 4 },
  hoursBadge: {
    backgroundColor: '#eff6ff',
    color: '#2563eb',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  tagText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  openBadge: { backgroundColor: '#fef3c7' },
  openText: { color: '#b45309' },
  midBadge: { backgroundColor: '#e0e7ff' },
  midText: { color: '#4338ca' },
  closeBadge: { backgroundColor: '#fee2e2' },
  closeText: { color: '#b91c1c' },
  otherBadge: { backgroundColor: '#f1f5f9' },
  otherText: { color: '#475569' },

  emptyText: { textAlign: 'center', color: '#94a3b8', marginVertical: 24, fontSize: 14 },
  closeBtn: {
    backgroundColor: '#0f172a',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  closeBtnText: { color: '#fff', fontWeight: '700' },
});