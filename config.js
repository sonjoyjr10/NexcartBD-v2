/**
 * ============================================================================
 * SUPPER SHOP — USER PANEL — FIREBASE CONFIG
 * ============================================================================
 * This is the ONLY file that should ever contain Firebase project credentials.
 * Never hardcode these values anywhere else in the app.
 *
 * Both Supper-Shop-User and Supper-Shop-Admin point at the SAME Firebase
 * project (same projectId) — that shared project is the only channel these
 * two independent repos use to talk to each other. Copy the values from:
 * Firebase Console → Project Settings → General → "Your apps" → SDK config.
 *
 * SAFE TO EXPOSE: the Firebase Web SDK config below is not a secret — access
 * is controlled by Firestore/Storage Security Rules and Cloud Functions, not
 * by hiding this object. Do NOT put service-account keys or Admin SDK
 * credentials here — those belong only in Cloud Functions environment config.
 * ============================================================================
 */

const firebaseConfig = {
  apiKey: "REPLACE_WITH_YOUR_FIREBASE_API_KEY",
  authDomain: "REPLACE_WITH_YOUR_PROJECT.firebaseapp.com",
  projectId: "REPLACE_WITH_YOUR_PROJECT_ID",
  storageBucket: "REPLACE_WITH_YOUR_PROJECT.appspot.com",
  messagingSenderId: "REPLACE_WITH_YOUR_SENDER_ID",
  appId: "REPLACE_WITH_YOUR_APP_ID",
  measurementId: "REPLACE_WITH_YOUR_MEASUREMENT_ID" // optional, GA4
};

// Public VAPID key for Firebase Cloud Messaging (Web Push).
// Firebase Console → Project Settings → Cloud Messaging → Web configuration.
const FCM_VAPID_KEY = "REPLACE_WITH_YOUR_FCM_VAPID_KEY";

// ----------------------------------------------------------------------------
// App-wide constants (safe, non-secret configuration only)
// ----------------------------------------------------------------------------
const APP_CONFIG = {
  siteName: "Supper Shop",
  supportEmail: "support@suppershop.com",
  currency: "USD",
  currencySymbol: "$",
  // Cloud Functions region — must match where functions are deployed.
  functionsRegion: "us-central1",
  // Toggle to point at the Firebase Emulator Suite during local development.
  useEmulators: false,
  emulatorHost: "127.0.0.1",
  pages: {
    login: "/pages/login.html",
    dashboard: "/pages/dashboard.html"
  }
};

// ----------------------------------------------------------------------------
// Firebase SDK initialization (v10 modular, loaded via CDN in index.html)
// Exposed on window.* because this project intentionally uses plain
// <script type="module"> files rather than a bundler.
// ----------------------------------------------------------------------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  connectAuthEmulator
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  connectFirestoreEmulator
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  getStorage,
  connectStorageEmulator
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";
import {
  getFunctions,
  connectFunctionsEmulator
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-functions.js";
import { getMessaging, isSupported } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app, APP_CONFIG.functionsRegion);

let messaging = null;
isSupported().then((supported) => {
  if (supported) messaging = getMessaging(app);
});

if (APP_CONFIG.useEmulators) {
  connectAuthEmulator(auth, `http://${APP_CONFIG.emulatorHost}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, APP_CONFIG.emulatorHost, 8080);
  connectStorageEmulator(storage, APP_CONFIG.emulatorHost, 9199);
  connectFunctionsEmulator(functions, APP_CONFIG.emulatorHost, 5001);
}

export { app, auth, db, storage, functions, messaging, APP_CONFIG, FCM_VAPID_KEY };
