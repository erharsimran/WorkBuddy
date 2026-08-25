import React, { useState, useEffect } from 'react';
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
import { ShiftDbRow } from '../types';
import { fetchAllShifts, replaceAllShifts } from '../database/db';
import { setupNotificationChannels, scheduleShiftAlarms } from '../services/notifications';
import { parseScheduleFromImage } from '../services/gemini';
import { getCurrentUser, loginOrRegister, logoutUser } from '../services/auth';
import { downloadCalendarReminders, downloadTestCalendarAlert } from '../services/calendar';

// Helper to get ordinal suffix (1st, 2nd, 3rd, 25th, etc.)
function getOrdinalSuffix(day: number): string {
  if (day > 3 && day < 21) return `${day}th`;
  switch (day % 10) {
    case 1:  return `${day}st`;
    case 2:  return `${day}nd`;
    case 3:  return `${day}rd`;
    default: return `${day}th`;
  }
}

// Helper to format date with weekday always visible and relative day countdown
function formatShiftDate(dateStr: string) {
  if (!dateStr) return { formattedDate: '', weekday: '', relativeTag: '' };

  const parts = dateStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  const shiftDate = new Date(year, month, day, 0, 0, 0, 0);

  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  const weekday = shiftDate.toLocaleDateString('en-US', { weekday: 'short' });
  const formattedDate = `${weekday}, ${getOrdinalSuffix(day)} ${monthNames[month]}, ${year}`;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  const diffMs = shiftDate.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  let relativeTag = '';
  if (diffDays === 0) {
    relativeTag = 'Today';
  } else if (diffDays === 1) {
    relativeTag = 'Tomorrow';
  } else if (diffDays > 1) {
    relativeTag = `In ${diffDays} Days`;
  } else if (diffDays === -1) {
    relativeTag = 'Yesterday';
  } else if (diffDays < -1) {
    relativeTag = `${Math.abs(diffDays)} Days Ago`;
  }

  return { formattedDate, weekday, relativeTag };
}

export default function HomeScreen() {
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [submittingAuth, setSubmittingAuth] = useState<boolean>(false);

  const [nameInput, setNameInput] = useState('');
  const [passInput, setPassInput] = useState('');

  const [shifts, setShifts] = useState<ShiftDbRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedShift, setSelectedShift] = useState<ShiftDbRow | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await setupNotificationChannels();
        const savedUser = await getCurrentUser();
        if (savedUser) {
          setCurrentUser(savedUser);
          const savedShifts = await fetchAllShifts();
          setShifts(savedShifts);
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
      if (Platform.OS === 'web') {
        window.alert('Please enter both your name and password.');
      } else {
        Alert.alert('Input Error', 'Please enter both your name and password.');
      }
      return;
    }

    setSubmittingAuth(true);
    try {
      const success = await loginOrRegister(nameInput, passInput);
      if (!success) {
        if (Platform.OS === 'web') {
          window.alert('Authentication Failed: Incorrect password for this username.');
        } else {
          Alert.alert('Authentication Failed', 'Incorrect password for this username.');
        }
        setSubmittingAuth(false);
        return;
      }

      const trimmedUser = nameInput.trim();
      setCurrentUser(trimmedUser);
      const saved = await fetchAllShifts();
      setShifts(saved);
      setNameInput('');
      setPassInput('');
    } catch (err: any) {
      if (Platform.OS === 'web') {
        window.alert(err.message || 'Login error occurred');
      } else {
        Alert.alert('Login Error', err.message || 'An unexpected error occurred.');
      }
    } finally {
      setSubmittingAuth(false);
    }
  };

  const handleLogout = async () => {
    await logoutUser();
    setCurrentUser(null);
    setShifts([]);
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
      Alert.alert('Schedule Synced', `Loaded ${parsedShifts.length} shifts.`);
    } catch (err: any) {
      Alert.alert('Processing Error', err.message || 'Failed to process roster.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCalendarReminders = () => {
    if (shifts.length === 0) {
      Alert.alert('No Shifts Found', 'Upload and sync a roster first before exporting calendar alerts.');
      return;
    }
    downloadCalendarReminders(shifts, currentUser || 'My');
  };

  const handleTestAlert = () => {
    downloadTestCalendarAlert(currentUser || 'Harry');
  };

  if (authLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      </SafeAreaView>
    );
  }

  // --- LOGIN SCREEN ---
  if (!currentUser) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loginContainer}>
          <View style={styles.loginBox}>
            <Text style={styles.title}>WorkBuddy</Text>
            <Text style={styles.headerSubtitle}>Sign in to view your stored schedule</Text>

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
                activeOpacity={0.8}
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

  const isHarry = currentUser.trim().toLowerCase() === 'harry';

  // --- DASHBOARD ---
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>WorkBuddy</Text>
            <Text style={styles.headerSubtitle}>Logged in as {currentUser}</Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Text style={styles.logoutBtnText}>Logout</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.loadingText}>Extracting schedule & team with Gemini...</Text>
          </View>
        ) : (
          <View>
            <View style={styles.actionButtonRow}>
              <TouchableOpacity style={[styles.actionButton, styles.uploadButton]} onPress={handleUploadSchedule}>
                <Text style={styles.actionButtonText}>🖼️ Upload Roster</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.actionButton, styles.reminderButton]} onPress={handleAddCalendarReminders}>
                <Text style={styles.actionButtonText}>📅 Add to Calendar</Text>
              </TouchableOpacity>
            </View>

            {isHarry ? (
              <TouchableOpacity style={styles.testAlertButton} onPress={handleTestAlert}>
                <Text style={styles.testAlertButtonText}>🧪 Test 5-Min Calendar Alert</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        <Text style={styles.subtitle}>Upcoming Shifts</Text>

        <FlatList
          data={shifts}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => {
            const { formattedDate, relativeTag } = formatShiftDate(item.date);
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
                  <Text style={styles.hoursBadge}>{item.hours} hrs</Text>
                </View>

                <Text style={styles.timeText}>⏰ {item.start_time} - {item.end_time}</Text>

                <TouchableOpacity
                  style={styles.coworkerBtn}
                  onPress={() => setSelectedShift(item)}
                >
                  <Text style={styles.coworkerBtnText}>
                    👥 View Coworkers ({item.coworkers?.length || 0})
                  </Text>
                </TouchableOpacity>
              </View>
            );
          }}
          ListEmptyComponent={<Text style={styles.emptyText}>No shifts stored. Upload a roster image to populate.</Text>}
          contentContainerStyle={styles.listContent}
        />

        {/* Coworkers Modal */}
        <Modal visible={!!selectedShift} animationType="fade" transparent={true}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Full-Shift Coworkers</Text>
              <Text style={styles.modalSub}>
                {selectedShift ? formatShiftDate(selectedShift.date).formattedDate : ''} ({selectedShift?.start_time} - {selectedShift?.end_time})
              </Text>

              <ScrollView style={{ maxHeight: 250, marginVertical: 12 }}>
                {selectedShift?.coworkers && selectedShift.coworkers.length > 0 ? (
                  selectedShift.coworkers.map((name, idx) => (
                    <Text key={idx} style={styles.coworkerName}>• {name}</Text>
                  ))
                ) : (
                  <Text style={styles.noCoworkersText}>No coworkers working this full shift window.</Text>
                )}
              </ScrollView>

              <TouchableOpacity style={styles.closeBtn} onPress={() => setSelectedShift(null)}>
                <Text style={styles.closeBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8fafc' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
  loginContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  loginBox: {
    width: '100%',
    maxWidth: 400,
  },
  authCard: {
    backgroundColor: '#ffffff',
    padding: 24,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 18,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
    marginTop: 12,
  },
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
  loginSubmitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  title: { fontSize: 28, fontWeight: '800', color: '#0f172a' },
  headerSubtitle: { fontSize: 14, color: '#64748b', marginTop: 2 },
  logoutBtn: { backgroundColor: '#fee2e2', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  logoutBtnText: { color: '#ef4444', fontWeight: '700', fontSize: 13 },
  actionButtonRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  actionButton: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  uploadButton: { flex: 1, backgroundColor: '#2563eb' },
  reminderButton: { flex: 1, backgroundColor: '#7c3aed' },
  actionButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  testAlertButton: {
    backgroundColor: '#059669',
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testAlertButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  loadingContainer: { paddingVertical: 20, alignItems: 'center' },
  loadingText: { marginTop: 8, color: '#64748b', fontSize: 14, fontWeight: '600' },
  subtitle: { fontSize: 18, fontWeight: '700', color: '#1e293b', marginTop: 20, marginBottom: 12 },
  card: { backgroundColor: '#ffffff', padding: 16, borderRadius: 14, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 },
  dateText: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  tagBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tagText: { fontSize: 11, fontWeight: '700' },
  todayBadge: { backgroundColor: '#dcfce7' },
  todayText: { color: '#15803d', fontWeight: '800', textTransform: 'uppercase' },
  tomorrowBadge: { backgroundColor: '#e0e7ff' },
  tomorrowText: { color: '#4338ca', fontWeight: '800' },
  relativeBadge: { backgroundColor: '#f1f5f9' },
  relativeText: { color: '#475569' },
  hoursBadge: { backgroundColor: '#eff6ff', color: '#2563eb', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, fontSize: 12, fontWeight: '700' },
  timeText: { fontSize: 14, color: '#475569', marginBottom: 12, fontWeight: '500' },
  coworkerBtn: { backgroundColor: '#f1f5f9', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, alignSelf: 'flex-start' },
  coworkerBtnText: { color: '#334155', fontWeight: '600', fontSize: 13 },
  listContent: { paddingBottom: 30 },
  emptyText: { textAlign: 'center', color: '#94a3b8', marginTop: 40, fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  modalSub: { fontSize: 13, color: '#64748b', marginTop: 2 },
  coworkerName: { fontSize: 15, color: '#1e293b', fontWeight: '500', paddingVertical: 3 },
  noCoworkersText: { fontSize: 14, color: '#94a3b8', fontStyle: 'italic', paddingVertical: 8 },
  closeBtn: { backgroundColor: '#0f172a', paddingVertical: 10, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  closeBtnText: { color: '#fff', fontWeight: '700' },
});