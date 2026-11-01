import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  confirmPasswordReset as fbConfirmPasswordReset,
  verifyPasswordResetCode as fbVerifyPasswordResetCode,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  Auth,
} from 'firebase/auth';

import appletConfig from '../../firebase-applet-config.json';

// Official Firebase configuration for VOTAIASD V2 (votaiasd-v2)
const envApiKey = (import.meta.env.VITE_FIREBASE_API_KEY || '').trim();
const envAppId = (import.meta.env.VITE_FIREBASE_APP_ID || '').trim();
const envProjectId = (import.meta.env.VITE_FIREBASE_PROJECT_ID || '').trim();
const envAuthDomain = (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '').trim();

const projectId = (appletConfig.projectId || envProjectId || 'votaiasd-v2').trim();
const authDomain = (appletConfig.authDomain || envAuthDomain || `${projectId}.firebaseapp.com`).trim();
const apiKey = (appletConfig.apiKey || envApiKey || '').trim();
const appId = (appletConfig.appId || envAppId || '').trim();

const firebaseConfig = {
  apiKey,
  authDomain,
  projectId,
  storageBucket: appletConfig.storageBucket || `${projectId}.firebasestorage.app`,
  messagingSenderId: appletConfig.messagingSenderId || '',
  appId,
};

let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

export const auth: Auth = getAuth(app);

export {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  fbConfirmPasswordReset,
  fbVerifyPasswordResetCode,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
};

