"use client";

import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";
import { getApps, initializeApp } from "firebase/app";
import { browserLocalPersistence, connectAuthEmulator, getAuth, setPersistence, type Auth, type User } from "firebase/auth";
import { doc, getFirestore, serverTimestamp, setDoc } from "firebase/firestore";

type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
};

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || undefined,
} satisfies Partial<FirebaseConfig>;

export function isFirebaseConfigured() {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.storageBucket &&
      firebaseConfig.messagingSenderId &&
      firebaseConfig.appId,
  );
}

function getFirebaseConfig(): FirebaseConfig {
  if (!isFirebaseConfigured()) {
    throw new Error(
      "Firebase is not configured. Set the NEXT_PUBLIC_FIREBASE_* environment variables for the tendyy project.",
    );
  }

  return {
    apiKey: firebaseConfig.apiKey!,
    authDomain: firebaseConfig.authDomain!,
    projectId: firebaseConfig.projectId!,
    storageBucket: firebaseConfig.storageBucket!,
    messagingSenderId: firebaseConfig.messagingSenderId!,
    appId: firebaseConfig.appId!,
    measurementId: firebaseConfig.measurementId,
  };
}

let firebaseApp = getApps()[0] ?? null;
let firebaseAnalytics: Promise<Analytics | null> | null = null;
let authEmulatorConnected = false;

export function getFirebaseApp() {
  if (!firebaseApp) {
    firebaseApp = initializeApp(getFirebaseConfig());
  }
  return firebaseApp;
}

export function getFirebaseAuth() {
  const auth = getAuth(getFirebaseApp());
  connectConfiguredAuthEmulator(auth);
  return auth;
}

function connectConfiguredAuthEmulator(auth: Auth) {
  if (authEmulatorConnected || typeof window === "undefined") return;
  const host = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST?.trim();
  if (!host) return;
  connectAuthEmulator(auth, host.startsWith("http") ? host : `http://${host}`, { disableWarnings: true });
  authEmulatorConnected = true;
}

export function getFirebaseDb() {
  return getFirestore(getFirebaseApp());
}

export function getFirebaseAnalytics() {
  if (!firebaseConfig.measurementId) {
    return Promise.resolve(null);
  }

  if (!firebaseAnalytics) {
    firebaseAnalytics = isSupported().then((supported) => {
      if (!supported) {
        return null;
      }
      return getAnalytics(getFirebaseApp());
    });
  }

  return firebaseAnalytics;
}

export async function ensureFirebaseAuthPersistence() {
  if (typeof window === "undefined") return;
  await setPersistence(getFirebaseAuth(), browserLocalPersistence);
}

export async function syncFirebaseUserProfile(user: User) {
  await setDoc(
    doc(getFirebaseDb(), "users", user.uid),
    {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      emailVerified: user.emailVerified,
      lastLoginAt: serverTimestamp(),
    },
    { merge: true },
  );
}
