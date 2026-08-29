import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { loginOrRegister } from '../services/auth';
import { CustomAlertModal, AlertType } from './CustomAlertModal';
import { PhoneResetModal } from './PhoneResetModal';

interface Props {
  onLoginSuccess: (userName: string) => Promise<void> | void;
}

export const LoginScreen: React.FC<Props> = ({ onLoginSuccess }) => {
  const [nameInput, setNameInput] = useState('');
  const [passInput, setPassInput] = useState('');
  const [submittingAuth, setSubmittingAuth] = useState<boolean>(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState<boolean>(false);

  // In-app alert notification state
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

  const showAlert = (title: string, message: string, type: AlertType = 'error') => {
    setAlertConfig({
      visible: true,
      title,
      message,
      type,
    });
  };

  const handleLogin = async () => {
    const trimmedName = nameInput.trim();
    const trimmedPass = passInput.trim();

    if (!trimmedName || !trimmedPass) {
      showAlert(
        'Missing Information',
        'Please enter both your employee name and password.'
      );
      return;
    }

    setSubmittingAuth(true);
    try {
      const success = await loginOrRegister(trimmedName, trimmedPass);
      if (!success) {
        showAlert(
          'Incorrect Password',
          'The password entered does not match our records. Please try again or use Phone OTP reset below.'
        );
        return;
      }

      setNameInput('');
      setPassInput('');
      await onLoginSuccess(trimmedName);
    } catch (err: any) {
      showAlert(
        'Sign-in Notice',
        err.message || 'An unexpected error occurred while verifying credentials.'
      );
    } finally {
      setSubmittingAuth(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.loginContainer}>
        <View style={styles.loginBox}>
          <Text style={styles.title}>WorkBuddy</Text>
          <Text style={styles.headerSubtitle}>Sign in to access your store schedule</Text>

          <View style={styles.authCard}>
            <Text style={styles.inputLabel}>Employee Name or Nickname</Text>
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

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={styles.otpTriggerButton}
              onPress={() => setIsResetModalOpen(true)}
            >
              <Text style={styles.otpTriggerText}>
                📲 First time or Forgot Password? (Phone OTP)
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <PhoneResetModal
        visible={isResetModalOpen}
        initialIdentifier={nameInput}
        onClose={() => setIsResetModalOpen(false)}
        onSuccess={() => setIsResetModalOpen(false)}
      />

      <CustomAlertModal
        visible={alertConfig.visible}
        type={alertConfig.type}
        title={alertConfig.title}
        message={alertConfig.message}
        onClose={() => setAlertConfig((prev) => ({ ...prev, visible: false }))}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8fafc' },
  loginContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  loginBox: { width: '100%', maxWidth: 400 },
  title: { fontSize: 28, fontWeight: '800', color: '#0f172a', textAlign: 'center' },
  headerSubtitle: { fontSize: 14, color: '#64748b', marginTop: 4, textAlign: 'center' },
  authCard: {
    backgroundColor: '#ffffff',
    padding: 24,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 20,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  inputLabel: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 6, marginTop: 12 },
  textInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    backgroundColor: '#f8fafc',
    color: '#0f172a',
  },
  loginSubmitButton: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  loginSubmitButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#e2e8f0' },
  dividerText: { marginHorizontal: 10, fontSize: 12, fontWeight: '700', color: '#94a3b8' },
  otpTriggerButton: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  otpTriggerText: { color: '#1d4ed8', fontWeight: '700', fontSize: 13, textAlign: 'center' },
});