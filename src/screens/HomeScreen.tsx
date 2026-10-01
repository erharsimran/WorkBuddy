import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  ScrollView,
  Platform,
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
  logoutUser,
  getUserHourlyRate,
  setUserHourlyRate,
  getCurrentUserProfile,
  UserProfileDetails,
} from '../services/auth';

import { LoginScreen } from '../components/LoginScreen';
import { ScheduleTab } from '../components/ScheduleTab';
import { WeeklyTab } from '../components/WeeklyTab';
import { MonthlyTab } from '../components/MonthlyTab';
import { AdminTab, EmployeeRecord } from '../components/AdminTab';
import { CoworkersModal } from '../components/CoworkersModal';
import { EditShiftModal } from '../components/EditShiftModal';
import { EditRateModal } from '../components/EditRateModal';
import { UserProfileModal } from '../components/UserProfileModal';
import { EmployeeScheduleModal } from '../components/EmployeeScheduleModal';
import { PhoneResetModal } from '../components/PhoneResetModal';
import { CustomAlertModal, AlertType } from '../components/CustomAlertModal';
import { MarketplaceTab } from '../components/MarketplaceTab';

type TabType = 'schedule' | 'weekly' | 'monthly' | 'admin' | 'marketplace';

export default function HomeScreen() {
  const [activeTab, setActiveTab] = useState<TabType>('schedule');
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);

  const [shifts, setShifts] = useState<ShiftDbRow[]>([]);
  const [weeklyList, setWeeklyList] = useState<WeeklySummary[]>([]);
  const [hourlyRate, setHourlyRate] = useState<number>(18.10);
  const [uploadingRoster, setUploadingRoster] = useState<boolean>(false);

  // Retry state and live console terminal logs
  const [lastRosterBase64, setLastRosterBase64] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [processLogs, setProcessLogs] = useState<string[]>([]);
  const terminalScrollRef = useRef<ScrollView>(null);

  // Modals
  const [selectedShift, setSelectedShift] = useState<ShiftDbRow | null>(null);
  const [editingShift, setEditingShift] = useState<ShiftDbRow | null>(null);
  const [isRateModalOpen, setIsRateModalOpen] = useState<boolean>(false);

  // User Profile & Phone Reset Modals
  const [userProfile, setUserProfile] = useState<UserProfileDetails | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState<boolean>(false);

  // Admin Schedule Inspection Modal
  const [inspectedEmp, setInspectedEmp] = useState<EmployeeRecord | null>(null);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);

  // In-app Alert State
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    type: AlertType;
    title: string;
    message: string;
  }>({
    visible: false,
    type: 'info',
    title: '',
    message: '',
  });

  const showAlert = (title: string, message: string, type: AlertType = 'info') => {
    setAlertConfig({ visible: true, title, message, type });
  };

  const appendLog = (msg: string) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    setProcessLogs((prev) => [...prev, `[${time}] ${msg}`]);
  };

  const isAdmin = useMemo(() => {
    return currentUser?.toLowerCase().trim().startsWith('harry') ?? false;
  }, [currentUser]);

  const loadUserData = async (username: string) => {
    const rate = await getUserHourlyRate(username);
    setHourlyRate(rate);
    const [savedShifts, savedWeeks] = await Promise.all([
      fetchAllShifts(),
      fetchWeeklyHours(),
    ]);
    setShifts(savedShifts);
    setWeeklyList(savedWeeks);

    if (username.toLowerCase().trim().startsWith('harry')) {
      const empList = await fetchStoreEmployees();
      setEmployees(empList);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        await setupNotificationChannels();
        const savedUser = await getCurrentUser();
        if (savedUser) {
          setCurrentUser(savedUser);
          await loadUserData(savedUser);
        }
      } catch (err) {
        console.error('Session restore error:', err);
      } finally {
        setAuthLoading(false);
      }
    })();
  }, []);

  const handleLoginSuccess = async (userName: string) => {
    setCurrentUser(userName);
    await loadUserData(userName);
  };

  const handleLogout = async () => {
    await logoutUser();
    setCurrentUser(null);
    setShifts([]);
    setWeeklyList([]);
    setEmployees([]);
    setActiveTab('schedule');
  };

  const handleOpenMyProfile = async () => {
    if (!currentUser) return;
    const profile = await getCurrentUserProfile(currentUser);
    setUserProfile(profile);
    setIsProfileModalOpen(true);
  };

  const handleProfileUpdated = async (newDisplayName: string) => {
    setCurrentUser(newDisplayName);
    await loadUserData(newDisplayName);
  };

  const handleSaveHourlyRate = async (newRate: number) => {
    if (!currentUser) return;
    await setUserHourlyRate(currentUser, newRate);
    setHourlyRate(newRate);
    const updatedWeeks = await recalculateWeeklyHours();
    setWeeklyList(updatedWeeks);
    showAlert('Rate Updated', `Base hourly wage updated to $${newRate.toFixed(2)}/hr`, 'success');
  };

  const handleSaveShiftEdit = async (updated: ShiftDbRow) => {
    await updateSingleShift(updated);
    const [refreshedShifts, refreshedWeeks] = await Promise.all([
      fetchAllShifts(),
      fetchWeeklyHours(),
    ]);
    setShifts(refreshedShifts);
    setWeeklyList(refreshedWeeks);
    showAlert('Shift Updated', 'Your shift changes have been saved.', 'success');
  };

  // Reusable processor with live terminal console streaming
  const processRosterBase64 = async (base64: string) => {
    setUploadingRoster(true);
    setUploadError(null);
    setProcessLogs([`[${new Date().toLocaleTimeString('en-US', { hour12: false })}] Initializing roster processing...`]);

    try {
      appendLog('Dispatching image to AI OCR Agent...');
      const matrixData = await parseFullStoreRoster(base64, (msg) => appendLog(msg));

      appendLog(`AI response parsed: Week ${matrixData.week}, Store #${matrixData.store}`);
      appendLog(`Extracted ${matrixData.rows.length} total staff entries.`);

      await saveFullStoreRoster(matrixData, (msg) => appendLog(msg));

      appendLog('Refreshing local views & directory...');
      const [updated, updatedWeeks, updatedEmps] = await Promise.all([
        fetchAllShifts(),
        fetchWeeklyHours(),
        fetchStoreEmployees(),
      ]);
      setShifts(updated);
      setWeeklyList(updatedWeeks);
      setEmployees(updatedEmps);

      appendLog('Process finished cleanly.');
      setLastRosterBase64(null);
      setUploadError(null);
      setUploadingRoster(false);

      showAlert('Store Synced', `Processed entire roster for week of ${matrixData.week}.`, 'success');
    } catch (err: any) {
      const errorMsg = err.message || 'Roster processing encountered an error.';
      appendLog(`❌ ERROR: ${errorMsg}`);
      setUploadingRoster(false);
      setUploadError(errorMsg);
    }
  };

  const handleAdminUploadSchedule = async () => {
    if (!isAdmin) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]?.base64) return;

    const base64 = result.assets[0].base64;
    setLastRosterBase64(base64);
    await processRosterBase64(base64);
  };

  const handleRetryRoster = async () => {
    if (!lastRosterBase64) return;
    await processRosterBase64(lastRosterBase64);
  };

  const handleManualArchiveShifts = async () => {
    try {
      const baseUrl =
        typeof window !== 'undefined' && window.location.origin.includes('vercel.app')
          ? window.location.origin
          : 'https://work-buddy-flame-six.vercel.app';

      const response = await fetch(`${baseUrl}/api/archive-shifts`);
      const data = await response.json();

      if (data.success) {
        const [refreshedShifts, refreshedWeeks] = await Promise.all([
          fetchAllShifts(),
          fetchWeeklyHours(),
        ]);
        setShifts(refreshedShifts);
        setWeeklyList(refreshedWeeks);

        showAlert(
          'Archive Complete',
          data.message || `Archived ${data.archivedCount} member records and cleaned old shifts.`,
          'success'
        );
      } else {
        showAlert('Archive Error', data.error || 'Failed to archive shifts.', 'error');
      }
    } catch (err: any) {
      showAlert('Network Error', err.message || 'Unable to connect to archive service.', 'error');
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
      showAlert('Profile Saved', 'Employee directory information updated.', 'success');
    } catch (err: any) {
      showAlert('Save Error', err.message || 'Failed to update employee.', 'error');
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
      showAlert('Employee Removed', `${name} has been removed from the directory.`, 'success');
    } catch (err: any) {
      showAlert('Delete Error', err.message || 'Failed to delete employee.', 'error');
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
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
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
            onRetryRoster={handleRetryRoster}
            lastUploadError={uploadError}
            isUploadingRoster={uploadingRoster}
            hasCachedRosterImage={!!lastRosterBase64}
            onViewSchedule={(emp) => setInspectedEmp(emp)}
            onSaveEmployee={handleSaveEmp}
            onDeleteEmployee={handleDeleteEmp}
            onArchiveShifts={handleManualArchiveShifts}
          />
        )}

        {activeTab === 'marketplace' && (
          <MarketplaceTab
            currentUser={currentUser}
            isAdmin={isAdmin}
            myShifts={shifts}
            onShowAlert={showAlert}
          />
        )}

        {/* Modals */}
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

        <UserProfileModal
          visible={isProfileModalOpen}
          profile={userProfile}
          onClose={() => setIsProfileModalOpen(false)}
          onUpdated={handleProfileUpdated}
          onTriggerResetPassword={() => {
            setIsProfileModalOpen(false);
            setIsResetModalOpen(true);
          }}
        />

        <EmployeeScheduleModal
          employee={inspectedEmp}
          onClose={() => setInspectedEmp(null)}
        />

        <PhoneResetModal
          visible={isResetModalOpen}
          initialIdentifier={currentUser}
          onClose={() => setIsResetModalOpen(false)}
          onSuccess={() => setIsResetModalOpen(false)}
        />

        {/* Global in-app custom alert */}
        <CustomAlertModal
          visible={alertConfig.visible}
          type={alertConfig.type}
          title={alertConfig.title}
          message={alertConfig.message}
          onClose={() => setAlertConfig((prev) => ({ ...prev, visible: false }))}
        />

        {/* Fullscreen OCR / Terminal Console Modal */}
        <Modal visible={uploadingRoster || !!uploadError} transparent={true} animationType="fade">
          <View style={styles.fullscreenLoaderOverlay}>
            <View style={styles.loaderCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                {uploadingRoster ? (
                  <ActivityIndicator size="small" color="#2563eb" style={{ marginRight: 8 }} />
                ) : uploadError ? (
                  <Text style={{ fontSize: 18, marginRight: 8 }}>⚠️</Text>
                ) : (
                  <Text style={{ fontSize: 18, marginRight: 8 }}>✅</Text>
                )}
                <Text style={styles.loaderTitle}>
                  {uploadingRoster ? 'Processing Store Roster' : uploadError ? 'Process Halted' : 'Finished'}
                </Text>
              </View>

              {/* Terminal View */}
              <View style={styles.terminalContainer}>
                <View style={styles.terminalHeader}>
                  <Text style={styles.terminalHeaderDot}>🔴 🟡 🟢</Text>
                  <Text style={styles.terminalHeaderTitle}>sync-roster.log</Text>
                </View>
                <ScrollView
                  style={styles.terminalScroll}
                  ref={terminalScrollRef}
                  onContentSizeChange={() => terminalScrollRef.current?.scrollToEnd({ animated: true })}
                >
                  {processLogs.map((item, idx) => (
                    <Text
                      key={idx}
                      style={[
                        styles.terminalText,
                        item.includes('❌') || item.includes('error') || item.includes('Halted')
                          ? { color: '#f87171' }
                          : item.includes('⚠️')
                          ? { color: '#fbbf24' }
                          : item.includes('✓') || item.includes('🎉')
                          ? { color: '#4ade80' }
                          : { color: '#38bdf8' },
                      ]}
                    >
                      {item}
                    </Text>
                  ))}
                </ScrollView>
              </View>

              {/* Action Buttons */}
              <View style={styles.modalActionRow}>
                <TouchableOpacity
                  style={[styles.modalActionBtn, styles.modalCancelBtn]}
                  onPress={() => {
                    setUploadError(null);
                    setLastRosterBase64(null);
                    setUploadingRoster(false);
                  }}
                >
                  <Text style={styles.modalCancelBtnText}>{uploadingRoster ? 'Cancel' : 'Dismiss'}</Text>
                </TouchableOpacity>

                {uploadError && lastRosterBase64 && (
                  <TouchableOpacity
                    style={[styles.modalActionBtn, styles.modalRetryBtn]}
                    onPress={() => processRosterBase64(lastRosterBase64)}
                  >
                    <Text style={styles.modalRetryBtnText}>🔄 Retry Now</Text>
                  </TouchableOpacity>
                )}
              </View>
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
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('marketplace')}>
          <Text style={styles.tabIcon}>🔄</Text>
          <Text style={[styles.tabLabel, activeTab === 'marketplace' && styles.activeTabLabel]}>
            Swaps
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
  fullscreenLoaderOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  loaderCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 20,
    width: '100%',
    maxWidth: 420,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  loaderTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  terminalContainer: {
    width: '100%',
    backgroundColor: '#090d16',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
    overflow: 'hidden',
    marginVertical: 12,
    height: 230,
  },
  terminalHeader: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  terminalHeaderDot: { fontSize: 9, letterSpacing: 2 },
  terminalHeaderTitle: {
    color: '#94a3b8',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginLeft: 8,
    fontWeight: '600',
  },
  terminalScroll: { flex: 1, padding: 10 },
  terminalText: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginBottom: 4,
  },
  modalActionRow: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 8 },
  modalActionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtn: { backgroundColor: '#f1f5f9' },
  modalCancelBtnText: { color: '#475569', fontWeight: '700', fontSize: 13 },
  modalRetryBtn: { backgroundColor: '#2563eb' },
  modalRetryBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
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