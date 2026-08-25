import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ShiftDbRow } from '../types';

interface Props {
  shift: ShiftDbRow;
}

export default function ShiftCard({ shift }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.date}>{shift.date}</Text>
      <Text style={styles.time}>{shift.start_time} – {shift.end_time} ({shift.hours} hrs)</Text>
      <Text style={styles.status}>🔔 Alarms Active (-24h & -2h)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  date: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  time: { fontSize: 14, color: '#475569', marginTop: 4 },
  status: { fontSize: 12, color: '#16a34a', fontWeight: '600', marginTop: 8 },
});