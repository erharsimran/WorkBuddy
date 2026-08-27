import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { ShiftDbRow, WeeklySummary, CoworkerShift } from '../types';
import {
  fetchAllShifts,
  replaceAllShifts,
  fetchWeeklyHours,
  recalculateWeeklyHours,
  updateSingleShift,
} from '../database/db';
import { setupNotificationChannels, scheduleShiftAlarms } from '../services/notifications';
import { parseScheduleFromImage } from '../services/gemini';
import {
  getCurrentUser,
  loginOrRegister,
  logoutUser,
  getUserHourlyRate,
  setUserHourlyRate,
} from '../services/auth';
import { downloadCalendarReminders } from '../services/calendar';

type TabType = 'schedule' | 'weekly' | 'monthly';

const TAX_RATE = Number(process.env.EXPO_PUBLIC_TAX_RATE) || 0.0924;
const CPP_RATE = Number(process.env.EXPO_PUBLIC_CPP_RATE) || 0.0533;
const EI_RATE = Number(process.env.EXPO_PUBLIC_EI_RATE) || 0.0163;

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
  if (!dateStr) return { formattedDate: '', weekday: '', relativeTag: '', diffDays: 0 };

  const parts = dateStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  const shiftDate = new Date(year, month, day, 0, 0, 0, 0);
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const weekday = shiftDate.toLocaleDateString('en-US', { weekday: 'short' });
  const formattedDate = `${weekday}, ${getOrdinalSuffix(day)} ${monthNames[month]}, ${year}`;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const diffDays = Math.round((shiftDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  let relativeTag = '';
  if (diffDays === 0) relativeTag = 'Today';
  else if (diffDays === 1) relativeTag = 'Tomorrow';
  else if (diffDays > 1) relativeTag = `In ${diffDays} Days`;
  else if (diffDays === -1) relativeTag = 'Yesterday';
  else if (diffDays < -1) relativeTag = `${Math.abs(diffDays)} Days Ago`;

  return { formattedDate, weekday, relativeTag, diffDays };
}

function calculateDurationHours(start: string, end: string): number {
  try {
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);

    if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return 0;

    let startMinutes = startH * 60 + startM;
    let endMinutes = endH * 60 + endM;

    if (endMinutes < startMinutes) {
      endMinutes += 24 * 60;
    }

    const diff = (endMinutes - startMinutes) / 60;
    return Number(diff.toFixed(2));
  } catch {
    return 0;
  }
}

function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
}

function getShiftTag(startTime: string, endTime: string): { tag: string; type: 'open' | 'mid' | 'close' | 'other' } {
  const startMin = parseTimeToMinutes(startTime);
  const endMin = parseTimeToMinutes(endTime);

  // Starts around 6:00 AM (up to 7:00 AM)
  if (startMin >= 330 && startMin <= 420) {
    return { tag: 'Opening', type: 'open' };
  }

  // Ends at/after 20:30 (8:30 PM - 10:00 PM)
  if (endMin >= 1230 || (endMin < startMin && endMin <= 180)) {
    return { tag: 'Closing', type: 'close' };
  }

  // Starts before 10:00 AM and leaves around 18:00 - 19:30
  if (startMin < 600 && endMin >= 1020 && endMin <= 1200) {
    return { tag: 'Mid Shift', type: 'mid' };
  }

  return { tag: 'Regular', type: 'other' };
}

export default function HomeScreen() {
  const [activeTab, setActiveTab] = useState<TabType>('schedule');
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [submittingAuth, setSubmittingAuth] = useState<boolean>(false);

  const [nameInput, setNameInput] = useState('');
  const [passInput, setPassInput] = useState('');

  const [shifts, setShifts] = useState<ShiftDbRow[]>([]);
  const [weeklyList, setWeeklyList] = useState<WeeklySummary[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedShift, setSelectedShift] = useState<ShiftDbRow | null>(null);

  const [hourlyRate, setHourlyRate] = useState<number>(18.10);
  const [isRateModalOpen, setIsRateModalOpen] = useState<boolean>(false);
  const [newRateInput, setNewRateInput] = useState<string>('18.10');

  const [editingShift, setEditingShift] = useState<ShiftDbRow | null>(null);
  const [editStartTime, setEditStartTime] = useState<string>('');
  const [editEndTime, setEditEndTime] = useState<string>('');
  const [editHours, setEditHours] = useState<string>('');

  useEffect(() => {
    (async () => {
      try {
        await setupNotificationChannels();
        const savedUser = await getCurrentUser();
        if (savedUser) {
          setCurrentUser(savedUser);
          const rate = await getUserHourlyRate(savedUser);
          setHourlyRate(rate);
          setNewRateInput(rate.toString());

          const savedShifts = await fetchAllShifts();
          setShifts(savedShifts);
          const savedWeeks = await fetchWeeklyHours();
          setWeeklyList(savedWeeks);
        }
      } catch (err) {
        console.error('Failed to restore session:', err);
      } finally {
        setAuthLoading(false);
      }
    })();
  }, []);

  const handleLogin = async () => {
    if (!nameInput.trim() || !passInput.trim()) {
      Platform.OS === 'web'
        ? window.alert('Please enter both your name and password.')
        : Alert.alert('Input Error', 'Please enter both your name and password.');
      return;
    }

    setSubmittingAuth(true);
    try {
      const success = await loginOrRegister(nameInput, passInput);
      if (!success) {
        Platform.OS === 'web'
          ? window.alert('Authentication Failed: Incorrect password.')
          : Alert.alert('Authentication Failed', 'Incorrect password.');
        setSubmittingAuth(false);
        return;
      }

      const trimmedUser = nameInput.trim();
      setCurrentUser(trimmedUser);
      const rate = await getUserHourlyRate(trimmedUser);
      setHourlyRate(rate);
      setNewRateInput(rate.toString());

      const saved = await fetchAllShifts();
      setShifts(saved);
      const savedWeeks = await fetchWeeklyHours();
      setWeeklyList(savedWeeks);
      setNameInput('');
      setPassInput('');
    } catch (err: any) {
      Alert.alert('Login Error', err.message || 'An error occurred.');
    } finally {
      setSubmittingAuth(false);
    }
  };

  const handleLogout = async () => {
    await logoutUser();
    setCurrentUser(null);
    setShifts([]);
    setWeeklyList([]);
  };

  const handleSaveHourlyRate = async () => {
    const parsed = parseFloat(newRateInput);
    if (isNaN(parsed) || parsed <= 0) {
      Platform.OS === 'web'
        ? window.alert('Enter a valid hourly rate.')
        : Alert.alert('Invalid Rate', 'Enter a valid hourly rate.');
      return;
    }
    if (!currentUser) return;

    await setUserHourlyRate(currentUser, parsed);
    setHourlyRate(parsed);
    const updatedWeeks = await recalculateWeeklyHours();
    setWeeklyList(updatedWeeks);
    setIsRateModalOpen(false);
  };

  const handleOpenEditShift = (shift: ShiftDbRow) => {
    setEditingShift(shift);
    setEditStartTime(shift.start_time);
    setEditEndTime(shift.end_time);
    setEditHours(shift.hours.toString());
  };

  const handleStartTimeChange = (newStart: string) => {
    setEditStartTime(newStart);
    if (newStart.length === 5 && editEndTime.length === 5) {
      const autoHours = calculateDurationHours(newStart, editEndTime);
      if (autoHours > 0) setEditHours(autoHours.toString());
    }
  };

  const handleEndTimeChange = (newEnd: string) => {
    setEditEndTime(newEnd);
    if (editStartTime.length === 5 && newEnd.length === 5) {
      const autoHours = calculateDurationHours(editStartTime, newEnd);
      if (autoHours > 0) setEditHours(autoHours.toString());
    }
  };

  const handleSaveShiftEdit = async () => {
    if (!editingShift) return;

    const parsedHours = parseFloat(editHours);
    if (isNaN(parsedHours) || parsedHours <= 0) {
      Platform.OS === 'web'
        ? window.alert('Please enter valid hours.')
        : Alert.alert('Invalid Hours', 'Please enter valid hours.');
      return;
    }

    const updated: ShiftDbRow = {
      ...editingShift,
      start_time: editStartTime.trim(),
      end_time: editEndTime.trim(),
      hours: parsedHours,
    };

    await updateSingleShift(updated);

    const refreshedShifts = await fetchAllShifts();
    setShifts(refreshedShifts);
    const refreshedWeeks = await fetchWeeklyHours();
    setWeeklyList(refreshedWeeks);

    setEditingShift(null);
  };

  const handleUploadSchedule = async () => {
    if (!currentUser) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]?.base64) return;

    setLoading(true);
    try {
      const parsedShifts = await parseScheduleFromImage(result.assets[0].base64, currentUser);
      await replaceAllShifts(parsedShifts);
      await scheduleShiftAlarms(parsedShifts);

      const updated = await fetchAllShifts();
      setShifts(updated);
      const updatedWeeks = await fetchWeeklyHours();
      setWeeklyList(updatedWeeks);
      Alert.alert('Schedule Synced', `Processed and saved roster.`);
    } catch (err: any) {
      Alert.alert('Processing Error', err.message || 'Failed to process roster.');
    } finally {
      setLoading(false);
    }
  };

  const upcomingShifts = useMemo(() => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return shifts.filter((s) => s.date >= todayStr);
  }, [shifts]);

  const weeklyStats = useMemo(() => {
    const totalHours = shifts.reduce((sum, s) => sum + (Number(s.hours) || 0), 0);
    const avgShift = shifts.length > 0 ? (totalHours / shifts.length).toFixed(1) : '0';
    return { totalHours: totalHours.toFixed(1), shiftCount: shifts.length, avgShift };
  }, [shifts]);

  const monthlyStats = useMemo(() => {
    const monthMap: Record<
      string,
      { totalHours: number; count: number; label: string; gross: number; deductions: number; net: number }
    > = {};
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];

    shifts.forEach((shift) => {
      const parts = shift.date.split('-');
      if (parts.length >= 2) {
        const year = parts[0];
        const monthIndex = parseInt(parts[1], 10) - 1;
        const key = `${year}-${parts[1]}`;
        const label = `${monthNames[monthIndex]} ${year}`;

        if (!monthMap[key]) {
          monthMap[key] = { totalHours: 0, count: 0, label, gross: 0, deductions: 0, net: 0 };
        }
        const shiftHrs = Number(shift.hours) || 0;
        monthMap[key].totalHours += shiftHrs;
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

        return {
          key: k,
          label: monthMap[k].label,
          totalHours: hours.toFixed(1),
          count: monthMap[k].count,
          gross,
          deductions,
          net,
        };
      });
  }, [shifts, hourlyRate]);

  const sortedCoworkers = useMemo(() => {
    if (!selectedShift?.coworkers) return [];

    const list = [...selectedShift.coworkers];
    return list.sort((a, b) => {
      const timeA = typeof a === 'object' && a?.startTime ? parseTimeToMinutes(a.startTime) : 0;
      const timeB = typeof b === 'object' && b?.startTime ? parseTimeToMinutes(b.startTime) : 0;
      return timeA - timeB;
    });
  }, [selectedShift]);

  if (authLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      </SafeAreaView>
    );
  }

  // --- AUTH / LOGIN VIEW ---
  if (!currentUser) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loginContainer}>
          <View style={styles.loginBox}>
            <Text style={styles.title}>WorkBuddy</Text>
            <Text style={styles.headerSubtitle}>Sign in to sync your cloud schedule</Text>

            <View style={styles.authCard}>
              <Text style={styles.inputLabel}>Employee / Your Name</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Harry"
                placeholderTextColor="#94a3b8"
                value={nameInput}
                onChangeText={setNameInput}
                autoCapitalize="words"
                autoCorrect={false}
              />

              <Text style={styles.inputLabel}>Password</Text>
              <TextInput
                style={styles.textInput}
                placeholder="••••••••"
                placeholderTextColor="#94a3b8"
                value={passInput}
                onChangeText={setPassInput}
                secureTextEntry
                onSubmitEditing={handleLogin}
              />

              <TouchableOpacity
                style={styles.loginSubmitButton}
                onPress={handleLogin}
                disabled={submittingAuth}
              >
                {submittingAuth ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.loginSubmitButtonText}>Sign In / Continue</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>WorkBuddy</Text>
            <Text style={styles.headerSubtitle}>Logged in as {currentUser}</Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Text style={styles.logoutBtnText}>Logout</Text>
          </TouchableOpacity>
        </View>

        {/* Tab 1: SCHEDULE (Upcoming Shifts Only) */}
        {activeTab === 'schedule' && (
          <View style={styles.tabContentContainer}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2563eb" />
                <Text style={styles.loadingText}>Extracting schedule & team with Gemini...</Text>
              </View>
            ) : (
              <View style={styles.actionButtonRow}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.uploadButton]}
                  onPress={handleUploadSchedule}
                >
                  <Text style={styles.actionButtonText}>🖼️ Upload Roster</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionButton, styles.reminderButton]}
                  onPress={() => downloadCalendarReminders(shifts, currentUser || 'My')}
                >
                  <Text style={styles.actionButtonText}>📅 Add to Calendar</Text>
                </TouchableOpacity>
              </View>
            )}

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
                          <View
                            style={[
                              styles.tagBadge,
                              relativeTag === 'Today'
                                ? styles.todayBadge
                                : relativeTag === 'Tomorrow'
                                ? styles.tomorrowBadge
                                : styles.relativeBadge,
                            ]}
                          >
                            <Text
                              style={[
                                styles.tagText,
                                relativeTag === 'Today'
                                  ? styles.todayText
                                  : relativeTag === 'Tomorrow'
                                  ? styles.tomorrowText
                                  : styles.relativeText,
                              ]}
                            >
                              {relativeTag}
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      <View style={styles.iconActionsRow}>
                        <Text style={styles.hoursBadge}>{item.hours} hrs</Text>

                        <TouchableOpacity
                          style={styles.iconOnlyBtn}
                          onPress={() => setSelectedShift(item)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={styles.actionIcon}>👥</Text>
                          <Text style={styles.iconBadgeCount}>
                            {item.coworkers?.length || 0}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.iconOnlyBtn}
                          onPress={() => handleOpenEditShift(item)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={styles.actionIcon}>✏️</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Timing and Shift Tag Badge */}
                    <View style={styles.timeAndBadgeRow}>
                      <Text style={styles.timeText}>⏰ {item.start_time} - {item.end_time}</Text>
                      
                      <View
                        style={[
                          styles.shiftTagBadge,
                          shiftMeta.type === 'open'
                            ? styles.openBadge
                            : shiftMeta.type === 'close'
                            ? styles.closeBadge
                            : shiftMeta.type === 'mid'
                            ? styles.midBadge
                            : styles.otherBadge,
                        ]}
                      >
                        <Text
                          style={[
                            styles.shiftTagText,
                            shiftMeta.type === 'open'
                              ? styles.openText
                              : shiftMeta.type === 'close'
                              ? styles.closeText
                              : shiftMeta.type === 'mid'
                              ? styles.midText
                              : styles.otherText,
                          ]}
                        >
                          {shiftMeta.tag}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.emptyText}>
                  No upcoming shifts scheduled.
                </Text>
              }
              contentContainerStyle={styles.listContent}
            />
          </View>
        )}

        {/* Tab 2: WEEKLY BREAKDOWN */}
        {activeTab === 'weekly' && (
          <ScrollView style={styles.tabContentContainer} contentContainerStyle={styles.listContent}>
            <View style={styles.payHeaderRow}>
              <Text style={styles.subtitle}>Weekly Statements</Text>
              <TouchableOpacity
                style={styles.editRateBtn}
                onPress={() => setIsRateModalOpen(true)}
              >
                <Text style={styles.editRateBtnText}>⚙️ Base: ${hourlyRate.toFixed(2)}/hr</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{weeklyStats.totalHours} hrs</Text>
                <Text style={styles.statLabel}>Total Hours Logged</Text>
              </View>

              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{weeklyStats.shiftCount}</Text>
                <Text style={styles.statLabel}>Total Shifts</Text>
              </View>
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
                    <View style={styles.hoursBadgeContainer}>
                      <Text style={styles.payHoursBadge}>{w.totalHours} hrs</Text>
                    </View>
                  </View>

                  <View style={styles.payRowDivider} />

                  <View style={styles.payDetailsRow}>
                    <Text style={styles.payDetailLabel}>
                      Gross Earnings (@ ${w.hourlyRate.toFixed(2)}/hr):
                    </Text>
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
        )}

        {/* Tab 3: MONTHLY BREAKDOWN */}
        {activeTab === 'monthly' && (
          <ScrollView style={styles.tabContentContainer} contentContainerStyle={styles.listContent}>
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
        )}

        {/* Coworkers Modal with Shift Timing Tags & Chronological Sort */}
        <Modal visible={!!selectedShift} animationType="fade" transparent={true}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Daily Coworker Schedule</Text>
              <Text style={styles.modalSub}>
                {selectedShift ? formatShiftDate(selectedShift.date).formattedDate : ''}
              </Text>

              <ScrollView style={{ maxHeight: 340, marginVertical: 14 }}>
                {sortedCoworkers.length > 0 ? (
                  sortedCoworkers.map((c: CoworkerShift | string, idx: number) => {
                    const isObject = typeof c === 'object' && c !== null;
                    const name = isObject ? c.name : c;
                    const startTime = isObject ? c.startTime : '';
                    const endTime = isObject ? c.endTime : '';
                    const timeRange = startTime && endTime ? `${startTime} - ${endTime}` : null;
                    const shiftMeta = getShiftTag(startTime, endTime);

                    return (
                      <View key={idx} style={styles.coworkerRow}>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={styles.coworkerNameText}>• {name}</Text>
                          {timeRange ? (
                            <Text style={styles.coworkerSubTime}>⏰ {timeRange}</Text>
                          ) : null}
                        </View>

                        {timeRange ? (
                          <View
                            style={[
                              styles.shiftTagBadge,
                              shiftMeta.type === 'open'
                                ? styles.openBadge
                                : shiftMeta.type === 'close'
                                ? styles.closeBadge
                                : shiftMeta.type === 'mid'
                                ? styles.midBadge
                                : styles.otherBadge,
                            ]}
                          >
                            <Text
                              style={[
                                styles.shiftTagText,
                                shiftMeta.type === 'open'
                                  ? styles.openText
                                  : shiftMeta.type === 'close'
                                  ? styles.closeText
                                  : shiftMeta.type === 'mid'
                                  ? styles.midText
                                  : styles.otherText,
                              ]}
                            >
                              {shiftMeta.tag}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    );
                  })
                ) : (
                  <Text style={styles.noCoworkersText}>
                    No other coworkers scheduled on this date.
                  </Text>
                )}
              </ScrollView>

              <TouchableOpacity style={styles.closeBtn} onPress={() => setSelectedShift(null)}>
                <Text style={styles.closeBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Shift Editor Modal */}
        <Modal visible={!!editingShift} animationType="fade" transparent={true}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Edit Shift Timing</Text>
              <Text style={styles.modalSub}>
                {editingShift ? formatShiftDate(editingShift.date).formattedDate : ''}
              </Text>

              <Text style={styles.modalFieldLabel}>Start Time (HH:mm)</Text>
              <TextInput
                style={styles.textInput}
                value={editStartTime}
                onChangeText={handleStartTimeChange}
                placeholder="15:00"
              />

              <Text style={styles.modalFieldLabel}>End Time (HH:mm)</Text>
              <TextInput
                style={styles.textInput}
                value={editEndTime}
                onChangeText={handleEndTimeChange}
                placeholder="21:30"
              />

              <Text style={styles.modalFieldLabel}>Total Hours</Text>
              <TextInput
                style={styles.textInput}
                value={editHours}
                onChangeText={setEditHours}
                keyboardType="numeric"
                placeholder="6.5"
              />

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <TouchableOpacity
                  style={[styles.closeBtn, { flex: 1, backgroundColor: '#94a3b8' }]}
                  onPress={() => setEditingShift(null)}
                >
                  <Text style={styles.closeBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.closeBtn, { flex: 1, backgroundColor: '#2563eb' }]}
                  onPress={handleSaveShiftEdit}
                >
                  <Text style={styles.closeBtnText}>Save Shift</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Edit Hourly Rate Modal */}
        <Modal visible={isRateModalOpen} animationType="fade" transparent={true}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Update Hourly Rate</Text>
              <Text style={styles.modalSub}>
                Adjust base hourly wage to recalculate all pay projections.
              </Text>

              <TextInput
                style={[styles.textInput, { marginVertical: 14 }]}
                keyboardType="numeric"
                value={newRateInput}
                onChangeText={setNewRateInput}
                placeholder="e.g. 18.10"
              />

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={[styles.closeBtn, { flex: 1, backgroundColor: '#94a3b8' }]}
                  onPress={() => setIsRateModalOpen(false)}
                >
                  <Text style={styles.closeBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.closeBtn, { flex: 1, backgroundColor: '#2563eb' }]}
                  onPress={handleSaveHourlyRate}
                >
                  <Text style={styles.closeBtnText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>

      {/* Bottom Navigation Bar */}
      <View style={styles.bottomTabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'schedule' && styles.activeTabItem]}
          onPress={() => setActiveTab('schedule')}
        >
          <Text style={styles.tabIcon}>📅</Text>
          <Text style={[styles.tabLabel, activeTab === 'schedule' && styles.activeTabLabel]}>
            Schedule
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'weekly' && styles.activeTabItem]}
          onPress={() => setActiveTab('weekly')}
        >
          <Text style={styles.tabIcon}>⏱️</Text>
          <Text style={[styles.tabLabel, activeTab === 'weekly' && styles.activeTabLabel]}>
            Weekly
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'monthly' && styles.activeTabItem]}
          onPress={() => setActiveTab('monthly')}
        >
          <Text style={styles.tabIcon}>📊</Text>
          <Text style={[styles.tabLabel, activeTab === 'monthly' && styles.activeTabLabel]}>
            Monthly
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8fafc' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  tabContentContainer: { flex: 1 },

  // Auth / Login
  loginContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  loginBox: { width: '100%', maxWidth: 400 },
  authCard: {
    backgroundColor: '#ffffff',
    padding: 24,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 18,
  },
  inputLabel: { fontSize: 14, fontWeight: '700', color: '#334155', marginBottom: 6, marginTop: 12 },
  textInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    backgroundColor: '#f8fafc',
    color: '#0f172a',
  },
  loginSubmitButton: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
    minHeight: 52,
  },
  loginSubmitButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },

  // Header
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  title: { fontSize: 26, fontWeight: '800', color: '#0f172a' },
  headerSubtitle: { fontSize: 13, color: '#64748b', marginTop: 2 },
  logoutBtn: {
    backgroundColor: '#fee2e2',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  logoutBtnText: { color: '#ef4444', fontWeight: '700', fontSize: 13 },

  // Actions
  actionButtonRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  actionButton: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  uploadButton: { flex: 1, backgroundColor: '#2563eb' },
  reminderButton: { flex: 1, backgroundColor: '#7c3aed' },
  actionButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  loadingContainer: { paddingVertical: 20, alignItems: 'center' },
  loadingText: { marginTop: 8, color: '#64748b', fontSize: 14, fontWeight: '600' },
  subtitle: { fontSize: 18, fontWeight: '700', color: '#1e293b', marginTop: 16, marginBottom: 12 },

  // Shift Cards
  card: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    flex: 1,
  },
  dateText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  tagBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tagText: { fontSize: 11, fontWeight: '700' },
  todayBadge: { backgroundColor: '#dcfce7' },
  todayText: { color: '#15803d', fontWeight: '800', textTransform: 'uppercase' },
  tomorrowBadge: { backgroundColor: '#e0e7ff' },
  tomorrowText: { color: '#4338ca', fontWeight: '800' },
  relativeBadge: { backgroundColor: '#f1f5f9' },
  relativeText: { color: '#475569' },

  iconActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconOnlyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  actionIcon: {
    fontSize: 13,
  },
  iconBadgeCount: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginLeft: 3,
  },
  hoursBadge: {
    backgroundColor: '#eff6ff',
    color: '#2563eb',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    fontSize: 12,
    fontWeight: '700',
  },
  timeAndBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  timeText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
  },
  listContent: { paddingBottom: 24 },
  emptyText: { textAlign: 'center', color: '#94a3b8', marginTop: 40, fontSize: 14 },

  modalFieldLabel: { fontSize: 13, fontWeight: '700', color: '#475569', marginTop: 12, marginBottom: 4 },

  // Weekly Analysis
  payHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  editRateBtn: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  editRateBtnText: { color: '#0f172a', fontWeight: '700', fontSize: 13 },
  statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  statBox: {
    flex: 1,
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  statNumber: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  statLabel: { fontSize: 12, color: '#64748b', marginTop: 4, fontWeight: '600' },

  payCard: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  payCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  payWeekTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  payDateRangeText: { fontSize: 12, color: '#64748b', marginTop: 2, fontWeight: '500' },
  payDepositText: { fontSize: 12, color: '#059669', marginTop: 2, fontWeight: '700' },
  hoursBadgeContainer: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  payHoursBadge: { color: '#2563eb', fontWeight: '800', fontSize: 13 },
  payRowDivider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 12 },
  payDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  payDetailLabel: { fontSize: 13, color: '#475569', fontWeight: '500' },
  payDetailValue: { fontSize: 13, color: '#0f172a', fontWeight: '700' },
  payDetailDeduct: { fontSize: 13, color: '#ef4444', fontWeight: '700' },
  payDetailNetLabel: { fontSize: 14, color: '#0f172a', fontWeight: '800' },
  payDetailNetValue: { fontSize: 15, color: '#059669', fontWeight: '900' },

  // Monthly Breakdown
  monthlyPayCard: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  monthlyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  monthTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  monthSub: { fontSize: 13, color: '#64748b', marginTop: 2 },
  monthBadge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  monthHoursText: { color: '#2563eb', fontWeight: '800', fontSize: 14 },

  // Modals & Coworker Schedule Rows
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  modalSub: { fontSize: 13, color: '#64748b', marginTop: 2 },
  coworkerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  coworkerNameText: {
    fontSize: 15,
    color: '#0f172a',
    fontWeight: '700',
  },
  coworkerSubTime: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
    marginTop: 2,
  },
  shiftTagBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  shiftTagText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  openBadge: { backgroundColor: '#fef3c7' },
  openText: { color: '#b45309' },
  midBadge: { backgroundColor: '#e0e7ff' },
  midText: { color: '#4338ca' },
  closeBadge: { backgroundColor: '#fee2e2' },
  closeText: { color: '#b91c1c' },
  otherBadge: { backgroundColor: '#f1f5f9' },
  otherText: { color: '#475569' },

  noCoworkersText: {
    fontSize: 14,
    color: '#94a3b8',
    fontStyle: 'italic',
    paddingVertical: 8,
  },
  closeBtn: {
    backgroundColor: '#0f172a',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  closeBtnText: { color: '#fff', fontWeight: '700' },

  // Navigation Bar
  bottomTabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 24 : 10,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  tabItem: { alignItems: 'center', justifyContent: 'center', flex: 1, paddingVertical: 4 },
  activeTabItem: { opacity: 1 },
  tabIcon: { fontSize: 20, marginBottom: 3 },
  tabLabel: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  activeTabLabel: { color: '#2563eb', fontWeight: '800' },
});