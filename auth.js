/**
 * Authentication module — Firebase Auth + Firestore user profile bootstrap.
 * NOTE: wallet balance, rewardPoints and role are NEVER set from the client
 * after creation — Firestore rules lock those fields down; they only ever
 * change via Cloud Functions (see /firebase-backend/functions).
 */
import { auth, db } from "./config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { toast } from "./utils.js";

function genReferralCode(uid) {
  return "SS-" + uid.slice(0, 6).toUpperCase();
}

/** Reads ?ref=CODE from the URL so referral attribution survives signup */
function getReferralFromUrl() {
  return new URLSearchParams(window.location.search).get("ref") || null;
}

export async function registerUser({ name, email, password, phone }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });

  const referredBy = getReferralFromUrl();

  await setDoc(doc(db, "users", cred.user.uid), {
    uid: cred.user.uid,
    name,
    email,
    phone: phone || "",
    role: "user",
    status: "active",
    walletBalance: 0,
    rewardPoints: 0,
    referralCode: genReferralCode(cred.user.uid),
    referredBy,
    emailVerified: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  await sendEmailVerification(cred.user);
  toast("Account created! Check your inbox to verify your email.", "success");
  return cred.user;
}

export async function loginUser({ email, password }) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function logoutUser() {
  await signOut(auth);
}

export async function resendVerificationEmail() {
  if (auth.currentUser) {
    await sendEmailVerification(auth.currentUser);
    toast("Verification email sent.", "success");
  }
}

export async function forgotPassword(email) {
  await sendPasswordResetEmail(auth, email);
  toast("Password reset link sent to your email.", "success");
}

/** Fetches the Firestore profile doc paired with the auth user */
export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

/** Central auth-state listener used by every page to hydrate the header/nav */
export function watchAuthState(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) return callback(null, null);
    const profile = await getUserProfile(user.uid);
    callback(user, profile);
  });
}

/** Friendly Firebase Auth error messages */
export function authErrorMessage(err) {
  const map = {
    "auth/email-already-in-use": "That email is already registered — try logging in instead.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/weak-password": "Password must be at least 8 characters.",
    "auth/user-not-found": "No account found with that email.",
    "auth/wrong-password": "Incorrect password. Please try again.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment and try again."
  };
  return map[err?.code] || err?.message || "Something went wrong. Please try again.";
}
