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
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

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
    state.notifications = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    updateNotificationChrome();
    if (state.currentRoute.name === "notifications") renderNotificationsList();
    if (state.currentRoute.name === "dashboard") renderDashboardNotifications();
  }, () => { /* index still building or offline — fail quietly */ });
}

function onSignedOut() {
  state.user = null;
  state.profile = null;
  state.wallet = { balance: 0 };
  state.notifications = [];
  teardownUserListeners();
  $("#headerAuthArea").hidden = false;
  $("#mobileAuthArea").hidden = false;
  $("#headerUserArea").hidden = true;
  $("#mobileLogoutBtn").hidden = true;
}

function updateUserChrome() {
  const p = state.profile;
  if (!p) return;
  const avatar = p.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(p.fullName || "U")}`;
  $("#userAvatar").src = avatar;
  $("#userMenuName").textContent = p.fullName || "—";
  $("#userMenuEmail").textContent = p.email || "—";
}

function updateWalletChrome() {
  $("#walletPillAmount").textContent = formatCurrency(state.wallet.balance || 0);
}

function updateNotificationChrome() {
  const hasUnread = state.notifications.some((n) => !n.read);
  $("#notifDot").hidden = !hasUnread;
}

onAuthStateChanged(auth, (fbUser) => {
  if (fbUser) onAuthenticated(fbUser);
  else onSignedOut();
  renderRoute();
  hideAppLoader();
});
/* =============================================================================
   6. DASHBOARD
============================================================================= */
function loadDashboard() {
  const p = state.profile;
  if (!p) return;
  $("#dashAvatar").src = p.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(p.fullName || "U")}`;
  $("#dashName").textContent = `Welcome back, ${p.fullName || "there"}`;
  $("#dashEmail").textContent = p.email || "";
  $("#statWallet").textContent = formatCurrency(state.wallet.balance || 0);
  $("#statTotalOrders").textContent = p.totalOrders || 0;
  $("#statPendingOrders").textContent = p.pendingOrders || 0;
  $("#statCompletedOrders").textContent = p.completedOrders || 0;
  $("#statCancelledOrders").textContent = p.cancelledOrders || 0;
  $("#statReferralEarnings").textContent = formatCurrency(p.referralEarnings || 0);

  renderDashboardRecentOrders();
  renderDashboardNotifications();
}

async function renderDashboardRecentOrders() {
  const container = $("#dashRecentOrders");
  container.innerHTML = `<div class="skeleton" style="height:52px;margin-bottom:10px;"></div>`.repeat(3);
  try {
    const q = query(
      collection(db, COLLECTIONS.orders),
      where("uid", "==", state.user.uid),
      orderBy("createdAt", "desc"),
      limit(4)
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      container.innerHTML = `<p class="empty-state">No orders yet — <a href="#/shop" data-nav>browse the shop</a>.</p>`;
      return;
    }
    container.innerHTML = "";
    snap.docs.forEach((d) => container.appendChild(buildOrderRow({ id: d.id, ...d.data() })));
  } catch {
    container.innerHTML = `<p class="empty-state">Couldn't load recent orders.</p>`;
  }
}

function renderDashboardNotifications() {
  const container = $("#dashRecentNotifications");
  const items = state.notifications.slice(0, 4);
  if (!items.length) {
    container.innerHTML = `<p class="empty-state">You're all caught up.</p>`;
    return;
  }
  container.innerHTML = "";
  items.forEach((n) => container.appendChild(buildNotifRow(n)));
}
/* =============================================================================
   7. WALLET & TRANSACTION HISTORY
============================================================================= */
async function loadWalletHistory(filterType = "all") {
  $("#walletBalanceLarge").textContent = formatCurrency(state.wallet.balance || 0);
  const body = $("#walletTxBody");
  const emptyEl = $("#walletTxEmpty");
  body.innerHTML = `<tr><td colspan="6"><div class="skeleton" style="height:20px;"></div></td></tr>`;
  try {
    let q = query(
      collection(db, COLLECTIONS.transactions),
      where("uid", "==", state.user.uid),
      orderBy("createdAt", "desc"),
      limit(50)
    );
    const snap = await getDocs(q);
    let docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (filterType !== "all") docs = docs.filter((tx) => tx.type === filterType);

    if (!docs.length) {
      body.innerHTML = "";
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;
    body.innerHTML = docs.map((tx) => `
      <tr>
        <td>${formatDate(tx.createdAt)}</td>
        <td>${escapeHTML(txTypeLabel(tx.type))}</td>
        <td>${escapeHTML(tx.note || "—")}</td>
        <td style="color:${tx.amount < 0 ? "var(--danger)" : "var(--success)"}">${tx.amount < 0 ? "−" : "+"}${formatCurrency(Math.abs(tx.amount))}</td>
        <td>${formatCurrency(tx.balanceAfter ?? 0)}</td>
        <td><span class="badge badge--${badgeClassForTxStatus(tx.status)}">${escapeHTML(tx.status || "completed")}</span></td>
      </tr>
    `).join("");
  } catch {
    body.innerHTML = "";
    emptyEl.hidden = false;
    emptyEl.textContent = "Couldn't load your transaction history.";
  }
}

function txTypeLabel(type) {
  return { deposit: "Deposit", order: "Order", refund: "Refund", referral_bonus: "Referral bonus" }[type] || type;
}
function badgeClassForTxStatus(status) {
  return { pending_review: "pending", completed: "completed", rejected: "cancelled" }[status] || "processing";
}

$("#txFilter").addEventListener("click", (e) => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  $all(".chip", "#txFilter").forEach((c) => c.classList.remove("is-active"));
  btn.classList.add("is-active");
  loadWalletHistory(btn.dataset.filter);
});

/* =============================================================================
   8. DEPOSITS
============================================================================= */
async function loadDepositView() {
  await loadPaymentMethods();
  await loadDepositHistory();
}

async function loadPaymentMethods() {
  const select = $("#depositMethod");
  try {
    const q = query(collection(db, COLLECTIONS.paymentMethods), where("active", "==", true));
    const snap = await getDocs(q);
    state.paymentMethods = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    select.innerHTML = `<option value="" disabled selected>Select a payment method</option>` +
      state.paymentMethods.map((m) => `<option value="${escapeHTML(m.id)}">${escapeHTML(m.name)}</option>`).join("");
  } catch {
    select.innerHTML = `<option value="" disabled selected>Unable to load payment methods</option>`;
  }
}

$("#depositMethod").addEventListener("change", (e) => {
  const method = state.paymentMethods.find((m) => m.id === e.target.value);
  $("#depositMethodInstructions").textContent = method?.instructions || "";
});

async function loadDepositHistory() {
  const body = $("#depositHistoryBody");
  const emptyEl = $("#depositHistoryEmpty");
  body.innerHTML = `<tr><td colspan="5"><div class="skeleton" style="height:20px;"></div></td></tr>`;
  try {
    const q = query(
      collection(db, COLLECTIONS.transactions),
      where("uid", "==", state.user.uid),
      where("type", "==", "deposit"),
      orderBy("createdAt", "desc"),
      limit(20)
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      body.innerHTML = "";
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;
    body.innerHTML = snap.docs.map((d) => {
      const tx = d.data();
      return `
        <tr>
          <td>${formatDate(tx.createdAt)}</td>
          <td>${escapeHTML(tx.methodName || tx.method || "—")}</td>
          <td>${escapeHTML(tx.transactionId || "—")}</td>
          <td>${formatCurrency(tx.amount)}</td>
          <td><span class="badge badge--${badgeClassForTxStatus(tx.status)}">${escapeHTML((tx.status || "pending_review").replace("_", " "))}</span></td>
        </tr>`;
    }).join("");
  } catch {
    body.innerHTML = "";
    emptyEl.hidden = false;
  }
}

async function handleDepositSubmit(e) {
  e.preventDefault();
  const form = e.target;
  clearFormErrors(form);
  const methodId = $("#depositMethod").value;
  const amount = parseFloat($("#depositAmount").value);
  const transactionId = sanitizeInput($("#depositTxId").value);
  const fileInput = $("#depositScreenshot");

  let hasError = false;
  if (!methodId) { toast("Select a payment method.", "error"); hasError = true; }
  if (!amount || amount < APP_CONFIG.minDepositAmount) {
    setFieldError("depositAmount", `Minimum deposit is ${formatCurrency(APP_CONFIG.minDepositAmount)}.`);
    hasError = true;
  }
  if (!transactionId) { setFieldError("depositTxId", "Enter your payment reference."); hasError = true; }
  if (hasError) return;

  const btn = $("#depositSubmitBtn");
  setButtonLoading(btn, true);
  try {
    // Best-effort duplicate check — the authoritative check must live in
    // Security Rules / the verification backend, since this read can be
    // bypassed by a malicious client.
    const dupQuery = query(
      collection(db, COLLECTIONS.transactions),
      where("type", "==", "deposit"),
      where("transactionId", "==", transactionId)
    );
    const dupSnap = await getDocs(dupQuery);
    if (!dupSnap.empty) {
      setFieldError("depositTxId", "This transaction ID has already been submitted.");
      setButtonLoading(btn, false);
      return;
    }

    let screenshotURL = "";
    if (fileInput.files[0]) {
      const file = fileInput.files[0];
      const path = `deposits/${state.user.uid}/${Date.now()}_${file.name}`;
      const ref = storageRef(storage, path);
      await uploadBytes(ref, file);
      screenshotURL = await getDownloadURL(ref);
    }

    const method = state.paymentMethods.find((m) => m.id === methodId);
    await addDoc(collection(db, COLLECTIONS.transactions), {
      uid: state.user.uid,
      type: "deposit",
      amount,
      balanceAfter: null, // set only once verified & credited
      method: methodId,
      methodName: method?.name || "",
      transactionId,
      screenshotURL,
      status: "pending_review", // automatic verification / admin review happens server-side
      createdAt: serverTimestamp(),
    });
    await logAudit("deposit_submitted", { amount, methodId, transactionId });

    toast("Deposit submitted — your wallet will update once it's verified.", "success");
    form.reset();
    loadDepositHistory();
  } catch (err) {
    toast(err.message || "Couldn't submit your deposit. Try again.", "error");
  } finally {
    setButtonLoading(btn, false);
  }
}
/* =============================================================================
   9. GAMES / CATEGORIES / PRODUCTS (SHOP)
============================================================================= */
async function loadCategories() {
  try {
    const snap = await getDocs(collection(db, COLLECTIONS.categories));
    state.categories = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    const filterEl = $("#shopCategoryFilter");
    filterEl.innerHTML = `<button type="button" class="chip is-active" data-category="all">All</button>` +
      state.categories.map((c) => `<button type="button" class="chip" data-category="${escapeHTML(c.id)}">${escapeHTML(c.name)}</button>`).join("");
  } catch { /* categories are optional */ }
}

async function loadGamesForView(viewName) {
  const gridId = viewName === "home" ? "#homeGameGrid" : "#shopGameGrid";
  const grid = $(gridId);
  grid.innerHTML = `<div class="skeleton skeleton--card"></div>`.repeat(viewName === "home" ? 6 : 8);

  try {
    if (!state.games.length) {
      const q = query(collection(db, COLLECTIONS.games), where("status", "==", "active"));
      const snap = await getDocs(q);
      state.games = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    }
    if (viewName === "shop") await loadCategories();

    const games = viewName === "home" ? state.games.slice(0, 6) : state.games;
    renderGameGrid(games, grid);

    if (viewName === "shop") {
      $("#shopSearch").oninput = debounce(() => filterShopGrid(), 220);
      $("#shopCategoryFilter").onclick = (e) => {
        const chip = e.target.closest(".chip");
        if (!chip) return;
        $all(".chip", "#shopCategoryFilter").forEach((c) => c.classList.remove("is-active"));
        chip.classList.add("is-active");
        filterShopGrid();
      };
    }
  } catch {
    grid.innerHTML = "";
    toast("Couldn't load games right now.", "error");
  }
}

function renderGameGrid(games, grid) {
  if (!games.length) {
    grid.innerHTML = "";
    return;
  }
  grid.innerHTML = games.map((g) => `
    <a href="#/game/${escapeHTML(g.id)}" data-nav class="game-card" data-name="${escapeHTML((g.name || "").toLowerCase())}" data-category="${escapeHTML(g.category || "")}">
      <img class="game-card__image" src="${escapeHTML(g.image || g.icon || "")}" alt="${escapeHTML(g.name || "")}" loading="lazy" />
      <div class="game-card__body">
        <p class="game-card__name">${escapeHTML(g.name || "Untitled")}</p>
        <p class="game-card__category">${escapeHTML(g.category || "")}</p>
      </div>
    </a>
  `).join("");
}

function filterShopGrid() {
  const term = $("#shopSearch").value.trim().toLowerCase();
  const activeCategory = $(".chip.is-active", "#shopCategoryFilter")?.dataset.category || "all";
  let games = state.games;
  if (activeCategory !== "all") games = games.filter((g) => g.category === activeCategory);
  if (term) games = games.filter((g) => (g.name || "").toLowerCase().includes(term));
  renderGameGrid(games, $("#shopGameGrid"));
  $("#shopEmpty").hidden = games.length !== 0;
}

async function loadGameProducts(gameId) {
  const grid = $("#productGrid");
  grid.innerHTML = `<div class="skeleton skeleton--card"></div>`.repeat(6);
  $("#productEmpty").hidden = true;

  try {
    let game = state.games.find((g) => g.id === gameId);
    if (!game) {
      const gSnap = await getDoc(doc(db, COLLECTIONS.games, gameId));
      if (gSnap.exists()) game = { id: gSnap.id, ...gSnap.data() };
    }
    if (!game) {
      navigate("/shop");
      return;
    }
    state.selectedGame = game;
    $("#gameHeaderImage").src = game.image || game.icon || "";
    $("#gameHeaderImage").alt = game.name || "";
    $("#gameHeaderName").textContent = game.name || "Untitled";
    $("#gameHeaderCategory").textContent = game.category || "";

    const q = query(collection(db, COLLECTIONS.products), where("gameId", "==", gameId), where("status", "==", "active"));
    const snap = await getDocs(q);
    const products = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (!products.length) {
      grid.innerHTML = "";
      $("#productEmpty").hidden = false;
      return;
    }
    grid.innerHTML = products.map((p) => `
      <div class="product-card">
        <img class="product-card__image" src="${escapeHTML(p.image || "")}" alt="${escapeHTML(p.name || "")}" loading="lazy" />
        <p class="product-card__name">${escapeHTML(p.name || "Package")}</p>
        ${p.bonus ? `<p class="product-card__bonus">+${escapeHTML(p.bonus)} bonus</p>` : ""}
        <p class="product-card__price">${formatCurrency(p.price || 0)}</p>
        <a href="#/order/${escapeHTML(p.id)}" data-nav class="btn btn--primary btn--sm">Buy now</a>
      </div>
    `).join("");
  } catch {
    grid.innerHTML = "";
    toast("Couldn't load products for this game.", "error");
  }
}
