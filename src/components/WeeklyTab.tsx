import React, { useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { WeeklySummary } from '../types';

interface Props {
  weeklyList: WeeklySummary[];
  hourlyRate: number;
  onOpenRateModal: () => void;
}

function getCurrentWeekKey(): string {
  const target = new Date();
  const d = new Date(Date.UTC(target.getFullYear(), target.getMonth(), target.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${weekNo < 10 ? `0${weekNo}` : weekNo}`;
}

export const WeeklyTab: React.FC<Props> = ({ weeklyList, hourlyRate, onOpenRateModal }) => {
  const currentExpected = useMemo(() => {
    const activeKey = getCurrentWeekKey();
    const current = weeklyList.find((w) => w.weekKey === activeKey) || weeklyList[0];
    return {
      gross: current?.grossPay || 0,
      net: current?.estimatedNetPay || 0,
      hours: current?.totalHours || 0,
      shiftCount: current?.shiftCount || 0,
      weekKey: current?.weekKey || activeKey,
    };
  }, [weeklyList]);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
      <View style={styles.payHeaderRow}>
        <Text style={styles.subtitle}>Weekly Statements</Text>
        <TouchableOpacity style={styles.editRateBtn} onPress={onOpenRateModal}>
          <Text style={styles.editRateBtnText}>⚙️ Base: ${hourlyRate.toFixed(2)}/hr</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.expectedEarningsCard}>
        <Text style={styles.expectedLabel}>This Week Expected Net Pay ({currentExpected.weekKey})</Text>
        <Text style={styles.expectedNumber}>${currentExpected.net.toFixed(2)}</Text>
        <Text style={styles.expectedSubText}>
          Gross: ${currentExpected.gross.toFixed(2)} • {currentExpected.hours} hrs ({currentExpected.shiftCount} shifts)
        </Text>
      </View>

      {weeklyList.length === 0 ? (
        <Text style={styles.emptyText}>No weekly shift records found.</Text>
      ) : (
        weeklyList.map((w) => (
          <View key={w.weekKey} style={styles.payCard}>
            <View style={styles.payCardHeader}>
              <View>
                <Text style={styles.payWeekTitle}>{w.weekKey}</Text>
                <Text style={styles.payDateRangeText}>{w.startDate} to {w.endDate}</Text>
                <Text style={styles.payDepositText}>Deposit Date: {w.payDate}</Text>
              </View>
              <View style={styles.weeklyBadgeGroup}>
                <View style={styles.shiftCountBadgeContainer}><Text style={styles.shiftCountBadge}>{w.shiftCount} shifts</Text></View>
                <View style={styles.hoursBadgeContainer}><Text style={styles.payHoursBadge}>{w.totalHours} hrs</Text></View>
              </View>
            </View>

            <View style={styles.payRowDivider} />
            <View style={styles.payDetailsRow}>
              <Text style={styles.payDetailLabel}>Gross Earnings (@ ${w.hourlyRate.toFixed(2)}/hr):</Text>
              <Text style={styles.payDetailValue}>${w.grossPay.toFixed(2)}</Text>
            </View>
            <View style={styles.payDetailsRow}>
              <Text style={styles.payDetailLabel}>Est. Deductions (Tax/CPP/EI):</Text>
              <Text style={styles.payDetailDeduct}>-${w.totalDeductions.toFixed(2)}</Text>
            </View>
            <View style={[styles.payDetailsRow, { marginTop: 4 }]}>
              <Text style={styles.payDetailNetLabel}>Est. Net Deposit:</Text>
              <Text style={styles.payDetailNetValue}>${w.estimatedNetPay.toFixed(2)}</Text>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  subtitle: { fontSize: 18, fontWeight: '700', color: '#1e293b', marginTop: 16, marginBottom: 12 },
  payHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  editRateBtn: { backgroundColor: '#f1f5f9', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1' },
  editRateBtnText: { color: '#0f172a', fontWeight: '700', fontSize: 13 },
  expectedEarningsCard: { backgroundColor: '#0f172a', padding: 20, borderRadius: 16, alignItems: 'center', marginBottom: 16, marginTop: 12 },
  expectedLabel: { color: '#94a3b8', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  expectedNumber: { color: '#38bdf8', fontSize: 36, fontWeight: '900', marginTop: 6 },
  expectedSubText: { fontSize: 13, fontWeight: '600', color: '#cbd5e1', marginTop: 4 },
  payCard: { backgroundColor: '#ffffff', padding: 16, borderRadius: 14, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  payCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  payWeekTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  payDateRangeText: { fontSize: 12, color: '#64748b', marginTop: 2, fontWeight: '500' },
  payDepositText: { fontSize: 12, color: '#059669', marginTop: 2, fontWeight: '700' },
  weeklyBadgeGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  shiftCountBadgeContainer: { backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  shiftCountBadge: { color: '#475569', fontWeight: '700', fontSize: 12 },
  hoursBadgeContainer: { backgroundColor: '#eff6ff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  payHoursBadge: { color: '#2563eb', fontWeight: '800', fontSize: 13 },
  payRowDivider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 12 },
  payDetailsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  payDetailLabel: { fontSize: 13, color: '#475569', fontWeight: '500' },
  payDetailValue: { fontSize: 13, color: '#0f172a', fontWeight: '700' },
  payDetailDeduct: { fontSize: 13, color: '#ef4444', fontWeight: '700' },
  payDetailNetLabel: { fontSize: 14, color: '#0f172a', fontWeight: '800' },
  payDetailNetValue: { fontSize: 15, color: '#059669', fontWeight: '900' },
  emptyText: { textAlign: 'center', color: '#94a3b8', marginTop: 30, fontSize: 14 },
});