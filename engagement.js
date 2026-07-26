/**
 * "Engagement" features: reviews, coupon validation, referral stats,
 * notifications and wishlist. Grouped together since each is a thin
 * Firestore read/write layer around a single small collection.
 */
import { auth, db } from "./config.js";
import {
  collection, query, where, orderBy, limit, getDocs, addDoc, doc, getDoc,
  setDoc, deleteDoc, serverTimestamp, onSnapshot, updateDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

/* ---------------- Reviews ---------------- */
export async function submitReview({ gameId, orderId, rating, comment }) {
  const uid = auth.currentUser?.uid;
  return addDoc(collection(db, "reviews"), {
    uid, gameId, orderId: orderId || null, rating: Number(rating), comment,
    status: "pending", // moderated by admin before showing publicly
    createdAt: serverTimestamp()
  });
}

/* ---------------- Coupons ---------------- */
/** Client-side pre-check only (for UX). The real validation + discount
 *  calculation happens again inside the placeOrder Cloud Function. */
export async function previewCoupon(code) {
  const q = query(collection(db, "coupons"), where("code", "==", code.toUpperCase()), where("status", "==", "active"));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const c = snap.docs[0].data();
  if (c.expiresAt && c.expiresAt.toDate() < new Date()) return null;
  if (c.maxUses && c.usedCount >= c.maxUses) return null;
  return { id: snap.docs[0].id, ...c };
}

/* ---------------- Referral ---------------- */
export async function fetchReferralStats(uid) {
  const profileSnap = await getDoc(doc(db, "users", uid));
  const code = profileSnap.data()?.referralCode;
  const q = query(collection(db, "users"), where("referredBy", "==", code));
  const snap = await getDocs(q);
  return { code, referredCount: snap.size, referredUsers: snap.docs.map((d) => d.data()) };
}

/* ---------------- Notifications ---------------- */
export function watchNotifications(uid, callback) {
  const q = query(
    collection(db, "notifications"),
    where("audience", "in", [uid, "all"]),
    orderBy("createdAt", "desc"),
    limit(30)
  );
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

export async function markNotificationRead(notifId) {
  return updateDoc(doc(db, "notifications", notifId), { read: true });
}

/* ---------------- Wishlist ---------------- */
export async function toggleWishlist(uid, gameId) {
  const ref = doc(db, "users", uid, "wishlist", gameId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await deleteDoc(ref);
    return false;
  }
  await setDoc(ref, { gameId, addedAt: serverTimestamp() });
  return true;
}

export async function fetchWishlist(uid) {
  const snap = await getDocs(collection(db, "users", uid, "wishlist"));
  return snap.docs.map((d) => d.id);
}
