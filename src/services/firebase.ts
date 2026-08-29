import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyBhn_mDWqBe0J2lvR0h-2fhimnzJNJnnjY',
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'workbuddy-7ba34.firebaseapp.com',
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'workbuddy-7ba34',
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'workbuddy-7ba34.firebasestorage.app',
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '119203957071',
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:119203957071:web:fd71e77b800eb35a0edd3a',
};

// Initialize Firebase only once
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);