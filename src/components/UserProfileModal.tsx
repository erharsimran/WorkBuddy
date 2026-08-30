import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { UserProfileDetails, updateUserProfile } from '../services/auth';
import { CustomAlertModal, AlertType } from './CustomAlertModal';

interface Props {
  visible: boolean;
  profile: UserProfileDetails | null;
  onClose: () => void;
  onUpdated: (newDisplayName: string) => Promise<void> | void;
  onTriggerResetPassword?: () => void;
}

export const UserProfileModal: React.FC<Props> = ({
  visible,
  profile,
  onClose,
  onUpdated,
  onTriggerResetPassword,
}) => {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  // Styled alert state
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    type: AlertType;
    title: string;
    message: string;
    onDismiss?: () => void;
  }>({
    visible: false,
    type: 'info',
    title: '',
    message: '',
  });

  const showAlert = (title: string, message: string, type: AlertType = 'info', onDismiss?: () => void) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      type,
      onDismiss,
    });
  };

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '');
      setEmail(profile.email || '');
      setPhone(profile.phone || '');
      setPassword(profile.password || '');
    }
  }, [profile, visible]);

  const handleSave = async () => {
    if (!profile) return;
    if (!displayName.trim()) {
      showAlert('Validation Error', 'Display Name cannot be empty.', 'error');
      return;
    }

    setSaving(true);
    try {
      await updateUserProfile(profile.id, {
        display_name: displayName,
        email,
        phone,
        password,
      });

      await onUpdated(displayName.trim());
      showAlert('Profile Updated', 'Your profile details have been successfully saved.', 'success', onClose);
    } catch (err: any) {
      showAlert('Update Failed', err.message || 'Failed to update profile.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal visible={visible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>My Profile Settings</Text>
            <Text style={styles.modalSub}>
              Roster Name: {profile?.full_name} • ID #{profile?.id}
            </Text>

            <ScrollView style={{ maxHeight: 380, marginVertical: 12 }}>
              <Text style={styles.inputLabel}>Display / Nickname</Text>
              <TextInput
                style={styles.textInput}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="e.g. Harry"
                placeholderTextColor="#94a3b8"
              />

              <Text style={styles.inputLabel}>Email Address</Text>
              <TextInput
                style={styles.textInput}
                value={email}
                onChangeText={setEmail}
                placeholder="you@email.com"
                placeholderTextColor="#94a3b8"
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={styles.inputLabel}>Phone Number</Text>
              <TextInput
                style={styles.textInput}
                value={phone}
                onChangeText={setPhone}
                placeholder="(519) 000-0000"
                placeholderTextColor="#94a3b8"
                keyboardType="phone-pad"
              />

              <Text style={styles.inputLabel}>App Password</Text>
              <TextInput
                style={styles.textInput}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor="#94a3b8"
                secureTextEntry
              />
            </ScrollView>

            <View style={styles.btnRow}>
              <TouchableOpacity style={[styles.btn, styles.cancelBtn]} onPress={onClose}>
                <Text style={styles.btnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.saveBtn]}
                onPress={handleSave}
                disabled={saving}
              >
                <Text style={styles.btnText}>{saving ? 'Saving...' : 'Save Changes'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <CustomAlertModal
        visible={alertConfig.visible}
        type={alertConfig.type}
        title={alertConfig.title}
        message={alertConfig.message}
        onClose={() => {
          setAlertConfig((prev) => ({ ...prev, visible: false }));
          if (alertConfig.onDismiss) alertConfig.onDismiss();
        }}
      />
    </>
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
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  modalSub: { fontSize: 13, color: '#64748b', marginTop: 2 },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    marginTop: 10,
    marginBottom: 4,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 10,
    fontSize: 15,
    backgroundColor: '#f8fafc',
    color: '#0f172a',
  },
  resetOtpBtn: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 14,
  },
  resetOtpBtnText: { color: '#1d4ed8', fontWeight: '700', fontSize: 13 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  cancelBtn: { backgroundColor: '#94a3b8' },
  saveBtn: { backgroundColor: '#2563eb' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});