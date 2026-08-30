import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';

export interface EmployeeRecord {
  id: number;
  full_name: string;
  display_name: string;
  role_category: string;
  email?: string;
  phone?: string;
  password?: string;
}

interface Props {
  employees: EmployeeRecord[];
  onUploadRoster: () => void;
  onViewSchedule: (emp: EmployeeRecord) => void;
  onSaveEmployee: (id: number, details: Partial<EmployeeRecord>) => Promise<void>;
  onDeleteEmployee: (id: number, name: string) => Promise<void>;
  onArchiveShifts?: () => Promise<void>;
}

export const AdminTab: React.FC<Props> = ({
  employees,
  onUploadRoster,
  onViewSchedule,
  onSaveEmployee,
  onDeleteEmployee,
  onArchiveShifts,
}) => {
  const [editingEmp, setEditingEmp] = useState<EmployeeRecord | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [archiving, setArchiving] = useState(false);

  const handleOpenEdit = (emp: EmployeeRecord) => {
    setEditingEmp(emp);
    setDisplayName(emp.display_name || '');
    setRole(emp.role_category || 'Staff');
    setEmail(emp.email || '');
    setPhone(emp.phone || '');
    setPassword(emp.password || '');
  };

  const handleSave = async () => {
    if (!editingEmp) return;
    if (!displayName.trim()) {
      Alert.alert('Validation Error', 'Display name cannot be empty.');
      return;
    }
    await onSaveEmployee(editingEmp.id, {
      display_name: displayName,
      role_category: role,
      email,
      phone,
      password,
    });
    setEditingEmp(null);
  };

  const handleDelete = (emp: EmployeeRecord) => {
    const confirmMessage = `Are you sure you want to delete ${emp.display_name}? This will also delete all of their shifts.`;
    if (Platform.OS === 'web') {
      if (window.confirm(confirmMessage)) {
        onDeleteEmployee(emp.id, emp.display_name);
        setEditingEmp(null);
      }
    } else {
      Alert.alert('Delete Employee', confirmMessage, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            onDeleteEmployee(emp.id, emp.display_name);
            setEditingEmp(null);
          },
        },
      ]);
    }
  };

  const handleArchive = async () => {
    if (!onArchiveShifts) return;
    setArchiving(true);
    try {
      await onArchiveShifts();
    } finally {
      setArchiving(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
      <Text style={styles.subtitle}>Store Operations</Text>

      {/* Roster Upload Card */}
      <View style={styles.adminActionCard}>
        <Text style={styles.adminCardTitle}>Upload Weekly Store Schedule</Text>
        <Text style={styles.adminCardSub}>
          Upload the Dollarama store roster image to scan and update shifts for all staff.
        </Text>

        <TouchableOpacity style={styles.uploadButton} onPress={onUploadRoster}>
          <Text style={styles.uploadButtonText}>🖼️ Upload & Process Roster</Text>
        </TouchableOpacity>
      </View>

      {/* Weekly Shift Archive & Cleanup Card */}
      {onArchiveShifts && (
        <View style={[styles.adminActionCard, { marginTop: 12 }]}>
          <Text style={styles.adminCardTitle}>Archive & Clean Old Shifts</Text>
          <Text style={styles.adminCardSub}>
            Summarizes and saves previous week shift hours into the permanent archive table and purges old raw rows to save database storage.
          </Text>

          <TouchableOpacity
            style={styles.archiveButton}
            onPress={handleArchive}
            disabled={archiving}
          >
            {archiving ? (
              <ActivityIndicator color="#92400e" />
            ) : (
              <Text style={styles.archiveButtonText}>📦 Run Weekly Shift Archive</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      <Text style={[styles.subtitle, { marginTop: 24 }]}>
        Store Employee Directory ({employees.length})
      </Text>
      <Text style={styles.hintText}>💡 Tap an employee name to inspect their full schedule.</Text>

      {employees.length === 0 ? (
        <Text style={styles.emptyText}>No employees registered yet. Upload a roster.</Text>
      ) : (
        employees.map((emp) => (
          <View key={emp.id} style={styles.empCard}>
            <TouchableOpacity
              style={{ flex: 1, paddingRight: 8 }}
              onPress={() => onViewSchedule(emp)}
              activeOpacity={0.7}
            >
              <Text style={styles.empNameText}>
                {emp.display_name} <Text style={styles.empIdBadge}>(ID #{emp.id})</Text>
              </Text>
              <Text style={styles.empRoleText}>
                🏷️ {emp.role_category || 'Staff'} • Full: {emp.full_name}
              </Text>
              {emp.email ? <Text style={styles.empDetailText}>✉️ {emp.email}</Text> : null}
              {emp.phone ? <Text style={styles.empDetailText}>📞 {emp.phone}</Text> : null}
            </TouchableOpacity>

            <TouchableOpacity style={styles.empEditBtn} onPress={() => handleOpenEdit(emp)}>
              <Text style={styles.empEditBtnText}>⚙️ Edit</Text>
            </TouchableOpacity>
          </View>
        ))
      )}

      {/* Edit & Delete Modal */}
      <Modal visible={!!editingEmp} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Manage Employee Profile</Text>
            <Text style={styles.modalSub}>ID #{editingEmp?.id} • {editingEmp?.full_name}</Text>

            <ScrollView style={{ maxHeight: 420, marginVertical: 10 }}>
              <Text style={styles.inputLabel}>Display / App Name</Text>
              <TextInput style={styles.textInput} value={displayName} onChangeText={setDisplayName} placeholder="e.g. Harry H." />

              <Text style={styles.inputLabel}>Role / Department</Text>
              <TextInput style={styles.textInput} value={role} onChangeText={setRole} placeholder="e.g. Management, ATL and TL" />

              <Text style={styles.inputLabel}>Email Address</Text>
              <TextInput style={styles.textInput} value={email} onChangeText={setEmail} placeholder="employee@dollarama.com" keyboardType="email-address" autoCapitalize="none" />

              <Text style={styles.inputLabel}>Phone Number</Text>
              <TextInput style={styles.textInput} value={phone} onChangeText={setPhone} placeholder="(519) 000-0000" keyboardType="phone-pad" />

              <Text style={styles.inputLabel}>App Password</Text>
              <TextInput style={styles.textInput} value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry />
            </ScrollView>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={[styles.btn, styles.deleteBtn]} onPress={() => editingEmp && handleDelete(editingEmp)}>
                <Text style={styles.deleteBtnText}>🗑️ Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.cancelBtn]} onPress={() => setEditingEmp(null)}>
                <Text style={styles.btnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.saveBtn]} onPress={handleSave}>
                <Text style={styles.btnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  subtitle: { fontSize: 18, fontWeight: '700', color: '#1e293b', marginTop: 16, marginBottom: 4 },
  hintText: { fontSize: 12, color: '#64748b', marginBottom: 12 },
  adminActionCard: { backgroundColor: '#ffffff', padding: 18, borderRadius: 14, borderWidth: 1, borderColor: '#cbd5e1', marginBottom: 10 },
  adminCardTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  adminCardSub: { fontSize: 13, color: '#64748b', marginTop: 4, lineHeight: 18 },
  uploadButton: { backgroundColor: '#2563eb', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 12 },
  uploadButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  archiveButton: { backgroundColor: '#fef3c7', borderWidth: 1, borderColor: '#fde68a', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 12 },
  archiveButtonText: { color: '#92400e', fontSize: 14, fontWeight: '700' },
  empCard: { backgroundColor: '#ffffff', padding: 14, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  empNameText: { fontSize: 15, fontWeight: '800', color: '#2563eb' },
  empIdBadge: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  empRoleText: { fontSize: 13, color: '#475569', marginTop: 3 },
  empDetailText: { fontSize: 12, color: '#64748b', marginTop: 2 },
  empEditBtn: { backgroundColor: '#f1f5f9', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1' },
  empEditBtnText: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  emptyText: { textAlign: 'center', color: '#94a3b8', marginTop: 30, fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  modalSub: { fontSize: 13, color: '#64748b', marginTop: 2 },
  inputLabel: { fontSize: 13, fontWeight: '700', color: '#475569', marginTop: 10, marginBottom: 4 },
  textInput: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 10, fontSize: 15, backgroundColor: '#f8fafc', color: '#0f172a' },
  modalBtnRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  deleteBtn: { backgroundColor: '#fee2e2' },
  deleteBtnText: { fontWeight: '700', color: '#ef4444', fontSize: 13 },
  cancelBtn: { backgroundColor: '#94a3b8' },
  saveBtn: { backgroundColor: '#2563eb' },
  btnText: { fontWeight: '700', color: '#fff', fontSize: 13 },
});