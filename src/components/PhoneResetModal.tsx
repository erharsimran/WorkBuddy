import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import {
  sendFirebasePhoneOTP,
  verifyFirebaseOTPAndSetPassword,
} from '../services/auth';
import { CustomAlertModal, AlertType } from './CustomAlertModal';

interface Props {
  visible: boolean;
  initialIdentifier?: string;
  onClose: () => void;
  onSuccess: () => void;
}

export const PhoneResetModal: React.FC<Props> = ({
  visible,
  initialIdentifier = '',
  onClose,
  onSuccess,
}) => {
  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [phoneInput, setPhoneInput] = useState('');
  const [showPhoneField, setShowPhoneField] = useState(false);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

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

  useEffect(() => {
    if (visible) {
      setIdentifier(initialIdentifier);
    }
  }, [visible, initialIdentifier]);

  const showAlert = (title: string, message: string, type: AlertType = 'info', onDismiss?: () => void) => {
    setAlertConfig({
      visible: true,
      title,
      message,
      type,
      onDismiss,
    });
  };

  const handleSendOTP = async () => {
    if (!identifier.trim()) {
      showAlert('Input Required', 'Please enter your employee name or email.', 'error');
      return;
    }

    if (showPhoneField && !phoneInput.trim()) {
      showAlert('Phone Required', 'Please enter your mobile phone number.', 'error');
      return;
    }

    setLoading(true);
    setStatusMsg('');
    try {
      const res = await sendFirebasePhoneOTP(
        identifier,
        showPhoneField ? phoneInput : undefined,
        'recaptcha-container'
      );

      if (res.needsPhoneInput) {
        setEmployeeId(res.employeeId || null);
        setShowPhoneField(true);
        showAlert(
          'First-Time Setup',
          'No phone number found for this profile. Please enter your mobile phone number to receive your verification code.',
          'info'
        );
        return;
      }

      if (res.success && res.employeeId) {
        setEmployeeId(res.employeeId);
        setStatusMsg(res.message);
        setStep('verify');
      } else {
        showAlert('Verification Failed', res.message, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!employeeId) return;
    if (!otp.trim() || !newPassword.trim()) {
      showAlert('Input Required', 'Please enter both the 6-digit code and your new password.', 'error');
      return;
    }

    setLoading(true);
    try {
      const res = await verifyFirebaseOTPAndSetPassword(
        employeeId,
        otp,
        newPassword,
        showPhoneField ? phoneInput : undefined
      );

      if (res.success) {
        showAlert('Success!', res.message, 'success', () => {
          onSuccess();
          handleClose();
        });
      } else {
        showAlert('Verification Error', res.message, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep('request');
    setOtp('');
    setNewPassword('');
    setStatusMsg('');
    setPhoneInput('');
    setShowPhoneField(false);
    setEmployeeId(null);
    onClose();
  };

  return (
    <>
      <Modal visible={visible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {step === 'request' ? 'First-Time Setup & Recovery' : 'Enter SMS Code'}
            </Text>
            <Text style={styles.modalSub}>
              {step === 'request'
                ? showPhoneField
                  ? 'Link your phone number to register and secure your account.'
                  : 'Enter your roster name to verify via SMS OTP.'
                : statusMsg || 'Enter the 6-digit code sent to your phone.'}
            </Text>

            {step === 'request' ? (
              <View style={{ marginVertical: 14 }}>
                <Text style={styles.inputLabel}>Employee Name or Nickname</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Harry"
                  placeholderTextColor="#94a3b8"
                  value={identifier}
                  onChangeText={setIdentifier}
                  autoCapitalize="words"
                />

                {showPhoneField && (
                  <View style={{ marginTop: 10 }}>
                    <Text style={styles.inputLabel}>Mobile Phone Number</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="(519) 000-0000"
                      placeholderTextColor="#94a3b8"
                      value={phoneInput}
                      onChangeText={setPhoneInput}
                      keyboardType="phone-pad"
                    />
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.actionBtn, styles.primaryBtn]}
                  onPress={handleSendOTP}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.btnText}>
                      {showPhoneField ? '📲 Send Verification to My Phone' : '📲 Check Profile & Send OTP'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ marginVertical: 14 }}>
                <Text style={styles.inputLabel}>6-Digit SMS Code</Text>
                <TextInput
                  style={[styles.textInput, styles.otpInput]}
                  placeholder="123456"
                  placeholderTextColor="#cbd5e1"
                  value={otp}
                  onChangeText={setOtp}
                  keyboardType="numeric"
                  maxLength={6}
                />

                <Text style={styles.inputLabel}>Create New App Password</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="••••••••"
                  placeholderTextColor="#94a3b8"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                />

                <TouchableOpacity
                  style={[styles.actionBtn, styles.primaryBtn]}
                  onPress={handleVerify}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.btnText}>🔒 Confirm Phone & Save Password</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
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
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
  },
  modalTitle: { fontSize: 19, fontWeight: '800', color: '#0f172a' },
  modalSub: { fontSize: 13, color: '#64748b', marginTop: 4, lineHeight: 18 },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    marginTop: 6,
    marginBottom: 4,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    backgroundColor: '#f8fafc',
    color: '#0f172a',
  },
  otpInput: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 4,
    textAlign: 'center',
  },
  actionBtn: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 16,
  },
  primaryBtn: { backgroundColor: '#2563eb' },
  btnText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  cancelBtn: { alignItems: 'center', paddingVertical: 10, marginTop: 6 },
  cancelBtnText: { color: '#64748b', fontWeight: '600', fontSize: 13 },
});