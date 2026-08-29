import React, { useMemo } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity } from 'react-native';
import { ShiftDbRow } from '../types';
import { downloadCalendarReminders } from '../services/calendar';

interface Props {
  shifts: ShiftDbRow[];
  currentUser: string;
  onSelectShift: (shift: ShiftDbRow) => void;
  onEditShift: (shift: ShiftDbRow) => void;
}

function getOrdinalSuffix(day: number): string {
  if (day > 3 && day < 21) return `${day}th`;
  switch (day % 10) {
    case 1: return `${day}st`;
    case 2: return `${day}nd`;
    case 3: return `${day}rd`;
    default: return `${day}th`;
  }
}

function formatShiftDate(dateStr: string) {
  if (!dateStr) return { formattedDate: '', relativeTag: '' };
  const [year, month, day] = dateStr.split('-').map(Number);
  const shiftDate = new Date(year, month - 1, day);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const weekday = shiftDate.toLocaleDateString('en-US', { weekday: 'short' });
  const formattedDate = `${weekday}, ${getOrdinalSuffix(day)} ${monthNames[month - 1]}, ${year}`;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((shiftDate.getTime() - today.getTime()) / 86400000);

  let relativeTag = '';
  if (diffDays === 0) relativeTag = 'Today';
  else if (diffDays === 1) relativeTag = 'Tomorrow';
  else if (diffDays > 1) relativeTag = `In ${diffDays} Days`;
  else if (diffDays === -1) relativeTag = 'Yesterday';
  else if (diffDays < -1) relativeTag = `${Math.abs(diffDays)} Days Ago`;

  return { formattedDate, relativeTag };
}

function getShiftTag(startTime: string, endTime: string): { tag: string; type: 'open' | 'mid' | 'close' | 'other' } {
  const [sH, sM] = (startTime || '').split(':').map(Number);
  const [eH, eM] = (endTime || '').split(':').map(Number);
  const startMin = (sH || 0) * 60 + (sM || 0);
  const endMin = (eH || 0) * 60 + (eM || 0);

  if (startMin >= 330 && startMin <= 420) return { tag: 'Opening', type: 'open' };
  if (endMin >= 1230 || (endMin < startMin && endMin <= 180)) return { tag: 'Closing', type: 'close' };
  if (startMin < 600 && endMin >= 1020 && endMin <= 1200) return { tag: 'Mid Shift', type: 'mid' };
  return { tag: 'Regular', type: 'other' };
}

export const ScheduleTab: React.FC<Props> = ({ shifts, currentUser, onSelectShift, onEditShift }) => {
  const upcomingShifts = useMemo(() => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return shifts.filter((s) => s.date >= todayStr);
  }, [shifts]);

  return (
    <View style={styles.container}>
      <View style={styles.actionButtonRow}>
        <TouchableOpacity
          style={styles.reminderButton}
          onPress={() => downloadCalendarReminders(shifts, currentUser)}
        >
          <Text style={styles.actionButtonText}>📅 Add to Calendar (.ics)</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.subtitle}>Upcoming Shifts</Text>

      <FlatList
        data={upcomingShifts}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => {
          const { formattedDate, relativeTag } = formatShiftDate(item.date);
          const shiftMeta = getShiftTag(item.start_time, item.end_time);

          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.dateRow}>
                  <Text style={styles.dateText}>{formattedDate}</Text>
                  {relativeTag ? (
                    <View style={[styles.tagBadge, relativeTag === 'Today' ? styles.todayBadge : relativeTag === 'Tomorrow' ? styles.tomorrowBadge : styles.relativeBadge]}>
                      <Text style={[styles.tagText, relativeTag === 'Today' ? styles.todayText : relativeTag === 'Tomorrow' ? styles.tomorrowText : styles.relativeText]}>
                        {relativeTag}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.iconActionsRow}>
                  <Text style={styles.hoursBadge}>{item.hours} hrs</Text>
                  <TouchableOpacity style={styles.iconOnlyBtn} onPress={() => onSelectShift(item)}>
                    <Text style={styles.actionIcon}>👥</Text>
                    <Text style={styles.iconBadgeCount}>{item.coworkers?.length || 0}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.iconOnlyBtn} onPress={() => onEditShift(item)}>
                    <Text style={styles.actionIcon}>✏️</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.timeAndBadgeRow}>
                <Text style={styles.timeText}>⏰ {item.start_time} - {item.end_time}</Text>
                <View style={[styles.shiftTagBadge, styles[`${shiftMeta.type}Badge`]]}>
                  <Text style={[styles.shiftTagText, styles[`${shiftMeta.type}Text`]]}>{shiftMeta.tag}</Text>
                </View>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.emptyText}>No upcoming shifts scheduled.</Text>}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  actionButtonRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  reminderButton: { flex: 1, backgroundColor: '#7c3aed', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  actionButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  subtitle: { fontSize: 18, fontWeight: '700', color: '#1e293b', marginTop: 16, marginBottom: 12 },
  card: { backgroundColor: '#ffffff', padding: 14, borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 },
  dateText: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  tagBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tagText: { fontSize: 11, fontWeight: '700' },
  todayBadge: { backgroundColor: '#dcfce7' },
  todayText: { color: '#15803d', fontWeight: '800', textTransform: 'uppercase' },
  tomorrowBadge: { backgroundColor: '#e0e7ff' },
  tomorrowText: { color: '#4338ca', fontWeight: '800' },
  relativeBadge: { backgroundColor: '#f1f5f9' },
  relativeText: { color: '#475569' },
  iconActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconOnlyBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0' },
  actionIcon: { fontSize: 13 },
  iconBadgeCount: { fontSize: 11, fontWeight: '700', color: '#475569', marginLeft: 3 },
  hoursBadge: { backgroundColor: '#eff6ff', color: '#2563eb', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, fontSize: 12, fontWeight: '700' },
  timeAndBadgeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  timeText: { fontSize: 13, color: '#475569', fontWeight: '600' },
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
  emptyText: { textAlign: 'center', color: '#94a3b8', marginTop: 30, fontSize: 14 },
});