/**
 * script.js
 * ---------------------------------------------------------------------------
 * SA Topup Zone — User Panel application logic.
 * Single-file, vanilla ES module. No frameworks, no bundler required.
 *
 * IMPORTANT ARCHITECTURE NOTE ON MONEY MOVEMENT
 * Client-side code (this file) can never be fully trusted with financial
 * writes — anyone can open devtools and call these functions directly.
 * Two things make this safe in production:
 *   1. Firestore/Storage Security Rules must mirror every rule enforced
 *      here (balance checks, ownership checks, status transitions).
 *   2. Deposit crediting and referral-bonus crediting are written here as
 *      "pending review" writes only — the actual balance credit is meant
 *      to happen via a trusted Cloud Function (payment gateway webhook)
 *      or an Admin Panel approval action, never directly from the browser.
 * Order placement debits the wallet directly because it only ever *spends*
 * funds the user already has verified, inside a Firestore transaction that
 * re-checks the live balance at commit time.
 * ---------------------------------------------------------------------------
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  onAuthStateChanged,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  serverTimestamp,
  runTransaction,
  increment,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js";

import {
  firebaseConfig,
  COLLECTIONS,
  DOC_IDS,
  DEFAULT_SETTINGS,
  APP_CONFIG,
} from "./config.js";

/* =============================================================================
   0. FIREBASE INIT
============================================================================= */
// Tell the boot watchdog (inline script in index.html) that this module
// itself was fetched and started running — so it can tell "script.js/
// config.js never loaded" apart from "loaded fine, but Firebase failed".
window.__saTopupScriptLoaded = true;

let app, auth, db, storage;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
} catch (err) {
  window.saTopupShowBootError?.(
    `Firebase failed to initialize: ${err.message}. Double-check every value in config.js matches your Firebase project exactly.`
  );
  throw err;
}

/* =============================================================================
   1. APP STATE
============================================================================= */
const state = {
  user: null, // Firebase Auth user
  profile: null, // Firestore users/{uid} doc
  wallet: { balance: 0 }, // Firestore wallets/{uid} doc
  settings: { ...DEFAULT_SETTINGS }, // Firestore settings/general
  games: [],
  categories: [],
  products: [],
  paymentMethods: [],
  notifications: [],
  currentRoute: { name: "home", params: [] },
  redirectAfterLogin: null,
  selectedGame: null,
  selectedProduct: null,
  appliedCoupon: null,
  ordersPage: {
    cursor: [], // stack of last-doc snapshots per page for "previous"
    pageIndex: 0,
    lastDoc: null,
    statusFilter: "all",
    searchTerm: "",
  },
  unsubscribers: {}, // active onSnapshot listeners, keyed by name
};

/* =============================================================================
   2. DOM HELPERS & UTILITIES
============================================================================= */
const $ = (sel, root = document) => root.querySelector(sel);
const $all = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function escapeHTML(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeInput(str) {
  // Strip tags entirely for anything that gets stored back to Firestore.
  return String(str ?? "").replace(/<[^>]*>/g, "").trim();
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function formatCurrency(amount) {
  const symbol = state.settings.currencySymbol || APP_CONFIG.currencySymbol;
  const n = Number(amount) || 0;
  return `${symbol}${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-ZA", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function debounce(fn, wait = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function toast(message, type = "info") {
  const stack = $("#toastStack");
  if (!stack) return;
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  el.setAttribute("role", "status");
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => {
    el.classList.add("is-leaving");
    setTimeout(() => el.remove(), 200);
  }, APP_CONFIG.toastDurationMs);
}

function setFieldError(inputId, message) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const field = input.closest(".field");
  const errorEl = field?.querySelector(`[data-error-for="${inputId}"]`);
  if (message) {
    field?.classList.add("has-error");
    if (errorEl) errorEl.textContent = message;
  } else {
    field?.classList.remove("has-error");
    if (errorEl) errorEl.textContent = "";
  }
}

function clearFormErrors(form) {
  $all(".field", form).forEach((f) => f.classList.remove("has-error"));
}

function setButtonLoading(btn, isLoading) {
  if (!btn) return;
  btn.disabled = isLoading;
  btn.classList.toggle("is-loading", isLoading);
  const spinner = btn.querySelector(".btn__spinner");
  if (spinner) spinner.hidden = !isLoading;
}

function friendlyAuthError(err) {
  const code = err?.code || "";
  const map = {
    "auth/email-already-in-use": "That email is already registered — try logging in instead.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/weak-password": "Password should be at least 6 characters.",
    "auth/user-not-found": "No account found with that email.",
    "auth/wrong-password": "Incorrect password. Try again or reset it.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/too-many-requests": "Too many attempts — please wait a moment and try again.",
    "auth/network-request-failed": "Network error — check your connection and try again.",
  };
  return map[code] || err?.message || "Something went wrong. Please try again.";
}

async function logAudit(action, details = {}) {
  try {
    await addDoc(collection(db, COLLECTIONS.auditLogs), {
      uid: state.user?.uid || null,
      action,
      details,
      createdAt: serverTimestamp(),
    });
  } catch {
    /* Audit logging must never block the user-facing action. */
  }
}

function generateReferralCode(fullName) {
  const base = (fullName || "user").replace(/[^a-zA-Z]/g, "").slice(0, 5).toUpperCase() || "USER";
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${base}${rand}`;
}

/* =============================================================================
   3. BRANDING — loaded live from Firestore settings/general
============================================================================= */
function applySettingsToDOM(settings) {
  state.settings = { ...DEFAULT_SETTINGS, ...settings };
  const s = state.settings;

  document.documentElement.style.setProperty("--color-primary", s.primaryColor || DEFAULT_SETTINGS.primaryColor);
  document.documentElement.style.setProperty("--color-secondary", s.secondaryColor || DEFAULT_SETTINGS.secondaryColor);
  document.documentElement.style.setProperty("--color-accent", s.accentColor || DEFAULT_SETTINGS.accentColor);

  $("#brandName").textContent = s.siteName;
  $("#footerBrandName").textContent = s.siteName;
  $("#brandInitial").textContent = (s.siteName || "S").trim().charAt(0).toUpperCase();
  document.title = s.seoTitle || s.siteName;
  $("#seoTitle").textContent = s.seoTitle || s.siteName;
  $("#seoDescription").setAttribute("content", s.seoDescription || "");
  $("#ogTitle").setAttribute("content", s.seoTitle || s.siteName);
  $("#ogDescription").setAttribute("content", s.seoDescription || "");
  $("#twitterTitle").setAttribute("content", s.seoTitle || s.siteName);
  $("#twitterDescription").setAttribute("content", s.seoDescription || "");
  $("#footerText").textContent = s.footerText || DEFAULT_SETTINGS.footerText;
  $("#footerSupportEmail").textContent = s.supportEmail || "support@example.com";
  $("#footerSupportPhone").textContent = s.supportPhone || "";

  if (s.logoURL) {
    $("#brandLogo").src = s.logoURL;
    $("#brandLogo").hidden = false;
    $("#brandInitial").hidden = true;
    $("#ogImage").setAttribute("content", s.logoURL);
  } else {
    $("#brandLogo").hidden = true;
    $("#brandInitial").hidden = false;
  }

  if (s.faviconURL) $("#favicon").setAttribute("href", s.faviconURL);

  if (s.heroBanner) {
    $("#heroBg").style.background = `linear-gradient(180deg, rgba(6,15,12,0.35), rgba(6,15,12,0.9)), url(${s.heroBanner}) center/cover no-repeat`;
  }

  if (s.announcement && s.announcement.trim()) {
    $("#announcementText").textContent = s.announcement;
    $("#announcementBar").hidden = localStorage.getItem("dismissedAnnouncement") === s.announcement;
  } else {
    $("#announcementBar").hidden = true;
  }

  const structured = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: s.siteName,
    ...(s.logoURL ? { logo: s.logoURL } : {}),
    ...(s.supportEmail ? { email: s.supportEmail } : {}),
  };
  $("#structuredData").textContent = JSON.stringify(structured);

  const social = $("#footerSocial");
  social.innerHTML = "";
  Object.entries(s.socialLinks || {}).forEach(([platform, url]) => {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = platform;
    social.appendChild(a);
  });

  $("#supportContactInfo").textContent = s.supportEmail || s.supportPhone
    ? `Reach us at ${s.supportEmail || ""}${s.supportEmail && s.supportPhone ? " or " : ""}${s.supportPhone || ""}`
    : "Contact details will appear here soon.";
}

function listenToSettings() {
  const ref = doc(db, COLLECTIONS.settings, DOC_IDS.generalSettings);
  state.unsubscribers.settings = onSnapshot(
    ref,
    (snap) => {
      applySettingsToDOM(snap.exists() ? snap.data() : {});
    },
    () => applySettingsToDOM({})
  );
}

/* =============================================================================
   4. ROUTER
============================================================================= */
const PROTECTED_ROUTES = new Set(["dashboard", "wallet", "deposit", "orders", "referrals", "notifications", "settings", "order"]);

function parseHash() {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const parts = hash.split("/").filter(Boolean);
  const name = parts[0] || "home";
  return { name, params: parts.slice(1) };
}

function navigate(path) {
  window.location.hash = path;
}

function renderRoute() {
  const route = parseHash();
  state.currentRoute = route;

  if (PROTECTED_ROUTES.has(route.name) && !state.user) {
    state.redirectAfterLogin = `#/${[route.name, ...route.params].join("/")}`;
    navigate("/login");
    return;
  }
  if ((route.name === "login" || route.name === "register") && state.user) {
    navigate("/dashboard");
    return;
  }

  const knownViews = [
    "home", "login", "register", "forgot-password", "dashboard", "wallet", "deposit",
    "shop", "game", "order", "orders", "referrals", "notifications", "support", "settings",
  ];
  const viewName = knownViews.includes(route.name) ? route.name : "notfound";

  $all(".view").forEach((v) => v.classList.remove("is-active"));
  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.add("is-active");
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });

  $all(".main-nav__link, .mobile-nav a[data-nav]").forEach((link) => {
    const linkRoute = link.getAttribute("href").replace(/^#\/?/, "").split("/")[0];
    link.classList.toggle("is-active", linkRoute === viewName);
  });

  closeMobileNav();
  closeUserMenu();

  // View-specific data loads
  if (viewName === "shop" || viewName === "home") loadGamesForView(viewName);
  if (viewName === "game") loadGameProducts(route.params[0]);
  if (viewName === "order") loadOrderView(route.params[0]);
  if (viewName === "dashboard") loadDashboard();
  if (viewName === "wallet") loadWalletHistory();
  if (viewName === "deposit") loadDepositView();
  if (viewName === "orders") loadOrdersHistory(true);
  if (viewName === "referrals") loadReferrals();
  if (viewName === "notifications") loadNotificationsView();
  if (viewName === "support") loadSupportView();
  if (viewName === "settings") loadSettingsView();
}

window.addEventListener("hashchange", renderRoute);

/* =============================================================================
   5. AUTH
============================================================================= */
async function ensureUserDocuments(fbUser, extra = {}) {
  const userRef = doc(db, COLLECTIONS.users, fbUser.uid);
  const existing = await getDoc(userRef);
  if (existing.exists()) return;

  const referralCode = generateReferralCode(extra.fullName || fbUser.email);
  await setDoc(userRef, {
    fullName: extra.fullName || fbUser.displayName || "",
    email: fbUser.email,
    photoURL: fbUser.photoURL || "",
    walletBalance: 0,
    totalOrders: 0,
    pendingOrders: 0,
    completedOrders: 0,
    cancelledOrders: 0,
    referralCode,
    referredBy: extra.referredByUid || null,
    referralEarnings: 0,
    role: "user",
    createdAt: serverTimestamp(),
  });
  await setDoc(doc(db, COLLECTIONS.wallets, fbUser.uid), {
    balance: 0,
    updatedAt: serverTimestamp(),
  });

  if (extra.referredByUid) {
    await addDoc(collection(db, COLLECTIONS.referrals), {
      referrerUid: extra.referredByUid,
      referredUid: fbUser.uid,
      bonusAmount: 0,
      status: "pending", // becomes "credited" once an Admin Panel / Cloud Function verifies the first order
      createdAt: serverTimestamp(),
    });
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const form = e.target;
  clearFormErrors(form);
  const fullName = sanitizeInput($("#registerName").value);
  const email = $("#registerEmail").value.trim();
  const password = $("#registerPassword").value;
  const referralCodeInput = sanitizeInput($("#registerReferral").value).toUpperCase();
  const agreedTerms = $("#registerTerms").checked;

  let hasError = false;
  if (fullName.length < 2) { setFieldError("registerName", "Enter your full name."); hasError = true; }
  if (!/^\S+@\S+\.\S+$/.test(email)) { setFieldError("registerEmail", "Enter a valid email."); hasError = true; }
  if (password.length < 6) { setFieldError("registerPassword", "At least 6 characters required."); hasError = true; }
  if (!agreedTerms) { setFieldError("registerTerms", "You must accept the terms to continue."); hasError = true; }
  if (hasError) return;

  const btn = $("#registerSubmitBtn");
  setButtonLoading(btn, true);
  try {
    let referredByUid = null;
    if (referralCodeInput) {
      const q = query(collection(db, COLLECTIONS.users), where("referralCode", "==", referralCodeInput), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) referredByUid = snap.docs[0].id;
    }

    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: fullName });
    await ensureUserDocuments(cred.user, { fullName, referredByUid });
    await sendEmailVerification(cred.user);
    await logAudit("register", { email });
    toast("Account created — check your inbox to verify your email.", "success");
    navigate("/dashboard");
  } catch (err) {
    toast(friendlyAuthError(err), "error");
  } finally {
    setButtonLoading(btn, false);
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const form = e.target;
  clearFormErrors(form);
  const email = $("#loginEmail").value.trim();
  const password = $("#loginPassword").value;
  const remember = $("#rememberMe").checked;

  if (!/^\S+@\S+\.\S+$/.test(email)) { setFieldError("loginEmail", "Enter a valid email."); return; }
  if (!password) { setFieldError("loginPassword", "Enter your password."); return; }

  const btn = $("#loginSubmitBtn");
  setButtonLoading(btn, true);
  try {
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
    await signInWithEmailAndPassword(auth, email, password);
    toast("Welcome back!", "success");
    navigate(state.redirectAfterLogin || "/dashboard");
    state.redirectAfterLogin = null;
  } catch (err) {
    toast(friendlyAuthError(err), "error");
  } finally {
    setButtonLoading(btn, false);
  }
}

async function handleForgotPassword(e) {
  e.preventDefault();
  const email = $("#forgotEmail").value.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) { setFieldError("forgotEmail", "Enter a valid email."); return; }
  const btn = $("#forgotSubmitBtn");
  setButtonLoading(btn, true);
  try {
    await sendPasswordResetEmail(auth, email);
    toast("Reset link sent — check your inbox.", "success");
    navigate("/login");
  } catch (err) {
    toast(friendlyAuthError(err), "error");
  } finally {
    setButtonLoading(btn, false);
  }
}

async function handleLogout() {
  try {
    await signOut(auth);
    toast("You've been logged out.", "info");
    navigate("/home");
  } catch {
    toast("Couldn't log out — try again.", "error");
  }
}

function teardownUserListeners() {
  ["profile", "wallet", "notifications"].forEach((key) => {
    if (state.unsubscribers[key]) {
      state.unsubscribers[key]();
      delete state.unsubscribers[key];
    }
  });
}

function onAuthenticated(fbUser) {
  state.user = fbUser;
  $("#headerAuthArea").hidden = true;
  $("#mobileAuthArea").hidden = true;
  $("#headerUserArea").hidden = false;
  $("#mobileLogoutBtn").hidden = false;

  const profileRef = doc(db, COLLECTIONS.users, fbUser.uid);
  state.unsubscribers.profile = onSnapshot(profileRef, (snap) => {
    if (!snap.exists()) return;
    state.profile = snap.data();
    updateUserChrome();
    if (state.currentRoute.name === "dashboard") loadDashboard();
    if (state.currentRoute.name === "referrals") loadReferrals();
  });

  const walletRef = doc(db, COLLECTIONS.wallets, fbUser.uid);
  state.unsubscribers.wallet = onSnapshot(walletRef, (snap) => {
    state.wallet = snap.exists() ? snap.data() : { balance: 0 };
    updateWalletChrome();
    if (state.currentRoute.name === "order") updateOrderSummary();
  });

  const notifQuery = query(
    collection(db, COLLECTIONS.notifications),
    where("uid", "in", [fbUser.uid, "all"]),
    orderBy("createdAt", "desc"),
    limit(30)
  );
  state.unsubscribers.notifications = onSnapshot(notifQuery, (snap) => {
    state.notifications = snap.docs.map((d) => ({ id: d.id, ...d.data() 
