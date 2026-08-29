import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { ShiftDbRow, WeeklySummary } from '../types';
import {
  fetchAllShifts,
  saveFullStoreRoster,
  fetchWeeklyHours,
  recalculateWeeklyHours,
  updateSingleShift,
  fetchStoreEmployees,
  updateStoreEmployee,
  deleteStoreEmployee,
} from '../database/db';
import { setupNotificationChannels } from '../services/notifications';
import { parseFullStoreRoster } from '../services/gemini';
import {
  getCurrentUser,
  loginOrRegister,
  logoutUser,
  getUserHourlyRate,
  setUserHourlyRate,
  getCurrentUserProfile,
  UserProfileDetails,
} from '../services/auth';

import { ScheduleTab } from '../components/ScheduleTab';
import { WeeklyTab } from '../components/WeeklyTab';
import { MonthlyTab } from '../components/MonthlyTab';
import { AdminTab, EmployeeRecord } from '../components/AdminTab';
import { CoworkersModal } from '../components/CoworkersModal';
import { EditShiftModal } from '../components/EditShiftModal';
import { EditRateModal } from '../components/EditRateModal';
import { UserProfileModal } from '../components/UserProfileModal';

type TabType = 'schedule' | 'weekly' | 'monthly' | 'admin';

export default function HomeScreen() {
  const [activeTab, setActiveTab] = useState<TabType>('schedule');
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [submittingAuth, setSubmittingAuth] = useState<boolean>(false);
  const [nameInput, setNameInput] = useState('');
  const [passInput, setPassInput] = useState('');

  const [shifts, setShifts] = useState<ShiftDbRow[]>([]);
  const [weeklyList, setWeeklyList] = useState<WeeklySummary[]>([]);
  const [hourlyRate, setHourlyRate] = useState<number>(18.10);

  const [uploadingRoster, setUploadingRoster] = useState<boolean>(false);

  // Modals
  const [selectedShift, setSelectedShift] = useState<ShiftDbRow | null>(null);
  const [editingShift, setEditingShift] = useState<ShiftDbRow | null>(null);
  const [isRateModalOpen, setIsRateModalOpen] = useState<boolean>(false);

  // User Profile Modal
  const [userProfile, setUserProfile] = useState<UserProfileDetails | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);

  // Admin state
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);

  const isAdmin = useMemo(() => {
    return currentUser?.toLowerCase().trim().startsWith('harry') ?? false;
  }, [currentUser]);

  useEffect(() => {
    (async () => {
      try {
        await setupNotificationChannels();
        const savedUser = await getCurrentUser();
        if (savedUser) {
          setCurrentUser(savedUser);
          const rate = await getUserHourlyRate(savedUser);
          setHourlyRate(rate);
          const [savedShifts, savedWeeks] = await Promise.all([
            fetchAllShifts(),
            fetchWeeklyHours(),
          ]);
          setShifts(savedShifts);
          setWeeklyList(savedWeeks);
          if (savedUser.toLowerCase().trim().startsWith('harry')) {
            const empList = await fetchStoreEmployees();
            setEmployees(empList);
          }
        }
      } catch (err) {
        console.error('Session restore error:', err);
      } finally {
        setAuthLoading(false);
      }
    })();
  }, []);

  const handleOpenMyProfile = async () => {
    if (!currentUser) return;
    const profile = await getCurrentUserProfile(currentUser);
    setUserProfile(profile);
    setIsProfileModalOpen(true);
  };

  const handleProfileUpdated = async (newDisplayName: string) => {
    setCurrentUser(newDisplayName);
    const [savedShifts, savedWeeks] = await Promise.all([
      fetchAllShifts(),
      fetchWeeklyHours(),
    ]);
    setShifts(savedShifts);
    setWeeklyList(savedWeeks);
  };

  const handleLogin = async () => {
    if (!nameInput.trim() || !passInput.trim()) {
      Alert.alert('Input Error', 'Please enter both your name and password.');
      return;
    }
    setSubmittingAuth(true);
    try {
      const success = await loginOrRegister(nameInput, passInput);
      if (!success) {
        Alert.alert('Authentication Failed', 'Incorrect password.');
        setSubmittingAuth(false);
        return;
      }
      const trimmedUser = nameInput.trim();
      setCurrentUser(trimmedUser);
      const rate = await getUserHourlyRate(trimmedUser);
      setHourlyRate(rate);

      const [saved, savedWeeks] = await Promise.all([fetchAllShifts(), fetchWeeklyHours()]);
      setShifts(saved);
      setWeeklyList(savedWeeks);

      if (trimmedUser.toLowerCase().startsWith('harry')) {
        const empList = await fetchStoreEmployees();
        setEmployees(empList);
      }
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
    setEmployees([]);
    setActiveTab('schedule');
  };

  const handleSaveHourlyRate = async (newRate: number) => {
    if (!currentUser) return;
    await setUserHourlyRate(currentUser, newRate);
    setHourlyRate(newRate);
    const updatedWeeks = await recalculateWeeklyHours();
    setWeeklyList(updatedWeeks);
  };

  const handleSaveShiftEdit = async (updated: ShiftDbRow) => {
    await updateSingleShift(updated);
    const [refreshedShifts, refreshedWeeks] = await Promise.all([
      fetchAllShifts(),
      fetchWeeklyHours(),
    ]);
    setShifts(refreshedShifts);
    setWeeklyList(refreshedWeeks);
  };

  const handleAdminUploadSchedule = async () => {
    if (!isAdmin) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]?.base64) return;

    setUploadingRoster(true);
    try {
      const matrixData = await parseFullStoreRoster(result.assets[0].base64);
      await saveFullStoreRoster(matrixData);
      const [updated, updatedWeeks, updatedEmps] = await Promise.all([
        fetchAllShifts(),
        fetchWeeklyHours(),
        fetchStoreEmployees(),
      ]);
      setShifts(updated);
      setWeeklyList(updatedWeeks);
      setEmployees(updatedEmps);
      Alert.alert('Store Synced', `Processed entire roster for week of ${matrixData.week}.`);
    } catch (err: any) {
      Alert.alert('Processing Error', err.message || 'Failed to process store roster.');
    } finally {
      setUploadingRoster(false);
    }
  };

  const handleSaveEmp = async (id: number, details: Partial<EmployeeRecord>) => {
    try {
      await updateStoreEmployee(id, {
        display_name: details.display_name || '',
        role_category: details.role_category || 'Staff',
        email: details.email,
        phone: details.phone,
        password: details.password,
      });
      const [updatedEmps, updatedShifts] = await Promise.all([
        fetchStoreEmployees(),
        fetchAllShifts(),
      ]);
      setEmployees(updatedEmps);
      setShifts(updatedShifts);
      Alert.alert('Success', 'Employee profile updated.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update employee.');
    }
  };

  const handleDeleteEmp = async (id: number, name: string) => {
    try {
      await deleteStoreEmployee(id);
      const [updatedEmps, updatedShifts] = await Promise.all([
        fetchStoreEmployees(),
        fetchAllShifts(),
      ]);
      setEmployees(updatedEmps);
      setShifts(updatedShifts);
      Alert.alert('Deleted', `${name} has been removed from the directory.`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to delete employee.');
    }
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

  if (!currentUser) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loginContainer}>
          <View style={styles.loginBox}>
            <Text style={styles.title}>WorkBuddy</Text>
            <Text style={styles.headerSubtitle}>Sign in to access your store schedule</Text>
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
        {/* Header with Profile Edit & Logout */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>WorkBuddy</Text>
            <Text style={styles.headerSubtitle}>
              Logged in as {currentUser} {isAdmin ? '👑 (Admin)' : ''}
            </Text>
          </View>

          <View style={styles.headerButtonsRow}>
            <TouchableOpacity style={styles.profileBtn} onPress={handleOpenMyProfile}>
              <Text style={styles.profileBtnText}>⚙️ Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
              <Text style={styles.logoutBtnText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>

        {activeTab === 'schedule' && (
          <ScheduleTab
            shifts={shifts}
            currentUser={currentUser}
            onSelectShift={(s) => setSelectedShift(s)}
            onEditShift={(s) => setEditingShift(s)}
          />
        )}

        {activeTab === 'weekly' && (
          <WeeklyTab
            weeklyList={weeklyList}
            hourlyRate={hourlyRate}
            onOpenRateModal={() => setIsRateModalOpen(true)}
          />
        )}

        {activeTab === 'monthly' && (
          <MonthlyTab shifts={shifts} hourlyRate={hourlyRate} />
        )}

        {activeTab === 'admin' && isAdmin && (
          <AdminTab
            employees={employees}
            onUploadRoster={handleAdminUploadSchedule}
            onSaveEmployee={handleSaveEmp}
            onDeleteEmployee={handleDeleteEmp}
          />
        )}

        <CoworkersModal shift={selectedShift} onClose={() => setSelectedShift(null)} />
        <EditShiftModal
          shift={editingShift}
          onClose={() => setEditingShift(null)}
          onSave={handleSaveShiftEdit}
        />
        <EditRateModal
          visible={isRateModalOpen}
          currentRate={hourlyRate}
          onClose={() => setIsRateModalOpen(false)}
          onSave={handleSaveHourlyRate}
        />

        {/* User Self-Profile Modal */}
        <UserProfileModal
          visible={isProfileModalOpen}
          profile={userProfile}
          onClose={() => setIsProfileModalOpen(false)}
          onUpdated={handleProfileUpdated}
        />

        {/* Fullscreen Loader */}
        <Modal visible={uploadingRoster} transparent={true} animationType="fade">
          <View style={styles.fullscreenLoaderOverlay}>
            <View style={styles.loaderCard}>
              <ActivityIndicator size="large" color="#2563eb" />
              <Text style={styles.loaderTitle}>Processing Store Roster</Text>
              <Text style={styles.loaderSub}>
                Extracting schedules and syncing relational data via Gemini AI...
              </Text>
            </View>
          </View>
        </Modal>
      </View>

      {/* Navigation */}
      <View style={styles.bottomTabBar}>
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('schedule')}>
          <Text style={styles.tabIcon}>📅</Text>
          <Text style={[styles.tabLabel, activeTab === 'schedule' && styles.activeTabLabel]}>
            Schedule
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('weekly')}>
          <Text style={styles.tabIcon}>⏱️</Text>
          <Text style={[styles.tabLabel, activeTab === 'weekly' && styles.activeTabLabel]}>
            Weekly
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('monthly')}>
          <Text style={styles.tabIcon}>📊</Text>
          <Text style={[styles.tabLabel, activeTab === 'monthly' && styles.activeTabLabel]}>
            Monthly
          </Text>
        </TouchableOpacity>
        {isAdmin && (
          <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('admin')}>
            <Text style={styles.tabIcon}>👑</Text>
            <Text style={[styles.tabLabel, activeTab === 'admin' && styles.activeTabLabel]}>
              Admin
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8fafc' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerButtonsRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  title: { fontSize: 26, fontWeight: '800', color: '#0f172a' },
  headerSubtitle: { fontSize: 13, color: '#64748b', marginTop: 2 },
  profileBtn: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  profileBtnText: { color: '#0f172a', fontWeight: '700', fontSize: 13 },
  logoutBtn: {
    backgroundColor: '#fee2e2',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  logoutBtnText: { color: '#ef4444', fontWeight: '700', fontSize: 13 },
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
    padding: 12,
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
  },
  loginSubmitButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  fullscreenLoaderOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  loaderCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 28,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
  },
  loaderTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a', marginTop: 16 },
  loaderSub: { fontSize: 13, color: '#64748b', textAlign: 'center', marginTop: 6, lineHeight: 18 },
  bottomTabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingVertical: 10,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  tabItem: { alignItems: 'center', justifyContent: 'center', flex: 1, paddingVertical: 4 },
  tabIcon: { fontSize: 20, marginBottom: 3 },
  tabLabel: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  activeTabLabel: { color: '#2563eb', fontWeight: '800' },
});