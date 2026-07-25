/**
 * config.js
 * ---------------------------------------------------------------------------
 * SA Topup Zone — Firebase configuration & global app constants.
 *
 * This is the ONLY file that should contain Firebase project keys.
 * Everything here is PUBLIC configuration (safe to ship to the browser) —
 * Firebase web API keys are not secrets; real protection comes from
 * Firestore/Storage Security Rules and App Check, configured in the
 * Firebase Console / Admin Panel, not from hiding this file.
 *
 * Replace the placeholder values below with your own project's config,
 * which you can find in:
 *   Firebase Console → Project Settings → General → Your apps → SDK setup
 * ---------------------------------------------------------------------------
 */

// -----------------------------------------------------------------------
// 1. Firebase project configuration (replace with your own project values)
// -----------------------------------------------------------------------
export const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_FIREBASE_APP_ID",
};

// -----------------------------------------------------------------------
// 2. Firestore collection names — centralised so a rename only happens here
// -----------------------------------------------------------------------
export const COLLECTIONS = {
  users: "users",
  orders: "orders",
  wallets: "wallets",
  transactions: "transactions",
  games: "games",
  products: "products",
  categories: "categories",
  coupons: "coupons",
  notifications: "notifications",
  settings: "settings",
  reviews: "reviews",
  banners: "banners",
  paymentMethods: "payment_methods",
  support: "support",
  referrals: "referrals",
  auditLogs: "audit_logs",
};

// -----------------------------------------------------------------------
// 3. Document IDs for singleton documents
// -----------------------------------------------------------------------
export const DOC_IDS = {
  generalSettings: "general",
};

// -----------------------------------------------------------------------
// 4. Fallback branding — used only until Firestore settings finish loading,
//    or if the settings document does not exist yet. The Admin Panel is the
//    real source of truth; nothing below should be treated as hardcoded
//    business content.
// -----------------------------------------------------------------------
export const DEFAULT_SETTINGS = {
  siteName: "SA Topup Zone",
  tagline: "Instant top-ups. Zero waiting.",
  logoURL: "",
  faviconURL: "",
  primaryColor: "#0B3D2E",
  secondaryColor: "#F4C430",
  accentColor: "#4ADE80",
  footerText: "© SA Topup Zone. All rights reserved.",
  socialLinks: {},
  supportPhone: "",
  supportEmail: "",
  announcement: "",
  heroBanner: "",
  seoTitle: "SA Topup Zone — Game Top-Ups & Diamonds",
  seoDescription:
    "Top up game diamonds, memberships and passes instantly and securely.",
};

// -----------------------------------------------------------------------
// 5. App-wide constants
// -----------------------------------------------------------------------
export const APP_CONFIG = {
  ordersPageSize: 8,
  currency: "ZAR",
  currencySymbol: "R",
  minDepositAmount: 10,
  toastDurationMs: 4200,
  sessionRememberKey: "sa_topup_remember_me",
};
