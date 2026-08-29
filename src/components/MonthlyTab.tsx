import React, { useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView } from 'react-native';
import { ShiftDbRow } from '../types';

interface Props {
  shifts: ShiftDbRow[];
  hourlyRate: number;
}

const TAX_RATE = Number(process.env.EXPO_PUBLIC_TAX_RATE) || 0.0924;
const CPP_RATE = Number(process.env.EXPO_PUBLIC_CPP_RATE) || 0.0533;
const EI_RATE = Number(process.env.EXPO_PUBLIC_EI_RATE) || 0.0163;

export const MonthlyTab: React.FC<Props> = ({ shifts, hourlyRate }) => {
  const monthlyStats = useMemo(() => {
    const monthMap: Record<string, { totalHours: number; count: number; label: string; gross: number; deductions: number; net: number }> = {};
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    shifts.forEach((shift) => {
      const parts = (shift.date || '').split('-');
      if (parts.length >= 2) {
        const year = parts[0];
        const monthIndex = parseInt(parts[1], 10) - 1;
        const key = `${year}-${parts[1]}`;
        const label = `${monthNames[monthIndex]} ${year}`;

        if (!monthMap[key]) {
          monthMap[key] = { totalHours: 0, count: 0, label, gross: 0, deductions: 0, net: 0 };
        }
        monthMap[key].totalHours += Number(shift.hours) || 0;
        monthMap[key].count += 1;
      }
    });

    return Object.keys(monthMap)
      .sort()
      .reverse()
      .map((k) => {
        const hours = monthMap[k].totalHours;
        const gross = Number((hours * hourlyRate).toFixed(2));
        const tax = Number((gross * TAX_RATE).toFixed(2));
        const cpp = Number((gross * CPP_RATE).toFixed(2));
        const ei = Number((gross * EI_RATE).toFixed(2));
        const deductions = Number((tax + cpp + ei).toFixed(2));
        const net = Number((gross - deductions).toFixed(2));

        return { key: k, label: monthMap[k].label, totalHours: hours.toFixed(1), count: monthMap[k].count, gross, deductions, net };
      });
  }, [shifts, hourlyRate]);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
      <Text style={styles.subtitle}>Monthly Summary</Text>
      {monthlyStats.length === 0 ? (
        <Text style={styles.emptyText}>No shift data available.</Text>
      ) : (
        monthlyStats.map((item) => (
          <View key={item.key} style={styles.monthlyPayCard}>
            <View style={styles.monthlyCardHeader}>
              <View>
                <Text style={styles.monthTitle}>{item.label}</Text>
                <Text style={styles.monthSub}>{item.count} shifts worked</Text>
              </View>
              <View style={styles.monthBadge}>
                <Text style={styles.monthHoursText}>{item.totalHours} hrs</Text>
              </View>
            </View>
            <View style={styles.payRowDivider} />
            <View style={styles.payDetailsRow}>
              <Text style={styles.payDetailLabel}>Gross Earnings:</Text>
              <Text style={styles.payDetailValue}>${item.gross.toFixed(2)}</Text>
            </View>
            <View style={styles.payDetailsRow}>
              <Text style={styles.payDetailLabel}>Est. Deductions:</Text>
              <Text style={styles.payDetailDeduct}>-${item.deductions.toFixed(2)}</Text>
            </View>
            <View style={[styles.payDetailsRow, { marginTop: 4 }]}>
              <Text style={styles.payDetailNetLabel}>Est. Net Earnings:</Text>
              <Text style={styles.payDetailNetValue}>${item.net.toFixed(2)}</Text>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  subtitle: { fontSize: 18, fontWeight: '700', color: '#1e293b', marginTop: 16, marginBottom: 12 },
  monthlyPayCard: { backgroundColor: '#ffffff', padding: 16, borderRadius: 14, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  monthlyCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  monthTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  monthSub: { fontSize: 13, color: '#64748b', marginTop: 2 },
  monthBadge: { backgroundColor: '#eff6ff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  monthHoursText: { color: '#2563eb', fontWeight: '800', fontSize: 14 },
  payRowDivider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 12 },
  payDetailsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  payDetailLabel: { fontSize: 13, color: '#475569', fontWeight: '500' },
  payDetailValue: { fontSize: 13, color: '#0f172a', fontWeight: '700' },
  payDetailDeduct: { fontSize: 13, color: '#ef4444', fontWeight: '700' },
  payDetailNetLabel: { fontSize: 14, color: '#0f172a', fontWeight: '800' },
  payDetailNetValue: { fontSize: 15, color: '#059669', fontWeight: '900' },
  emptyText: { textAlign: 'center', color: '#94a3b8', marginTop: 30, fontSize: 14 },
});