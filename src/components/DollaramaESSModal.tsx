import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

let WebViewComponent: any = null;
if (Platform.OS !== 'web') {
  try {
    WebViewComponent = require('react-native-webview').WebView;
  } catch (e) {
    console.warn('react-native-webview not installed or not supported on this platform');
  }
}

const ESS_URL = 'https://ess-sp.dollarama.com/ess/index.html#/paystub';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export const DollaramaESSModal: React.FC<Props> = ({ visible, onClose }) => {
  if (!visible) return null;

  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.open(ESS_URL, '_blank', 'noopener,noreferrer');
    }
    onClose();
    return null;
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={styles.safeArea}>
        {/* Dollarama Branded Top Bar */}
        <View style={styles.header}>
          <View style={styles.titleGroup}>
            <Text style={styles.brandTitle}>DOLLARAMA</Text>
            <Text style={styles.portalTitle}>Employee Self Service (ESS)</Text>
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>✕ Done</Text>
          </TouchableOpacity>
        </View>

        {/* WebView Viewport */}
        {WebViewComponent ? (
          <WebViewComponent
            source={{ uri: ESS_URL }}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.loaderCenter}>
                <ActivityIndicator size="large" color="#005a36" />
                <Text style={styles.loaderText}>Loading Dollarama ESS...</Text>
              </View>
            )}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            domStorageEnabled
            javaScriptEnabled
            allowsBackForwardNavigationGestures
            style={styles.webView}
          />
        ) : (
          <View style={styles.fallbackCenter}>
            <Text style={styles.fallbackText}>
              In-app browser is available on mobile builds.
            </Text>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#005a36',
  },
  header: {
    height: 56,
    backgroundColor: '#005a36', // Dollarama Green
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.15)',
  },
  titleGroup: {
    flexDirection: 'column',
  },
  brandTitle: {
    color: '#fbbf24', // Dollarama Gold Accent
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  portalTitle: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  closeButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  closeButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  webView: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  loaderCenter: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loaderText: {
    marginTop: 10,
    color: '#005a36',
    fontWeight: '700',
    fontSize: 13,
  },
  fallbackCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  fallbackText: {
    color: '#64748b',
    fontSize: 14,
  },
});