import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import HomeScreen from './src/screens/HomeScreen';
import { View } from 'react-native';

export default function App() {
  return (
    
    <SafeAreaProvider>
      <View id="recaptcha-container" style={{ position: 'absolute', top: -9999, left: -9999 }} />
      <HomeScreen />
    </SafeAreaProvider>
  );
}