/**
 * Orders module.
 *
 * Order CREATION is intentionally NOT a direct Firestore write. Firestore
 * rules deny client-side `create` on /orders. Instead `placeOrder` is a
 * Cloud Function (callable) that:
 *   1. Re-reads the package price server-side (ignores any client price),
 *   2. Checks + deducts the wallet balance atomically,
 *   3. Applies a coupon server-side if provided,
 *   4. Writes the order + a wallet_transactions debit entry in one transaction.
 * This is what "never trust the client for money" looks like in practice.
 */
import { auth, db, functions } from "./config.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-functions.js";
import {
  collection, query, where, orderBy, limit, getDocs, doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const placeOrderFn = httpsCallable(functions, "placeOrder");
const requestRefundFn = httpsCallable(functions, "requestRefund");

export async function placeOrder({ packageId, playerId, serverId, quantity = 1, couponCode }) {
  const res = await placeOrderFn({ packageId, playerId, serverId, quantity, couponCode: couponCode || null });
  return res.data; // { orderId, status, amountCharged, newBalance }
}

export async function requestRefund(orderId, reason) {
  const res = await requestRefundFn({ orderId, reason });
  return res.data;
}

export async function fetchMyOrders(uid, max = 50) {
  const q = query(
    collection(db, "orders"),
    where("uid", "==", uid),
    orderBy("createdAt", "desc"),
    limit(max)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function fetchOrderById(orderId) {
  const snap = await getDoc(doc(db, "orders", orderId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
