/**
 * Wallet module.
 *
 * IMPORTANT SECURITY NOTE:
 * The client NEVER writes to `walletBalance` or `wallet_transactions`
 * directly — Firestore rules deny that outright. A deposit here only ever
 * creates a `deposits/{id}` doc with status:"pending". The wallet is only
 * credited by the `approveDeposit` Cloud Function after an admin verifies
 * the payment (see /firebase-backend/functions/index.js), which then writes
 * the ledger entry and updates the balance atomically inside a transaction.
 */
import { auth, db, storage } from "./config.js";
import {
  collection, query, where, orderBy, limit, getDocs, addDoc, onSnapshot, doc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";

/** Live-subscribes to the current user's wallet balance & reward points */
export function watchWallet(uid, callback) {
  return onSnapshot(doc(db, "users", uid), (snap) => {
    if (!snap.exists()) return;
    const d = snap.data();
    callback({ balance: d.walletBalance || 0, rewardPoints: d.rewardPoints || 0 });
  });
}

export async function fetchWalletTransactions(uid, max = 50) {
  const q = query(
    collection(db, "wallet_transactions"),
    where("uid", "==", uid),
    orderBy("createdAt", "desc"),
    limit(max)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function fetchMyDeposits(uid, max = 30) {
  const q = query(
    collection(db, "deposits"),
    where("uid", "==", uid),
    orderBy("createdAt", "desc"),
    limit(max)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Submits a deposit request. `proofFile` (a payment screenshot/receipt) is
 * optional depending on the gateway, uploaded to Storage under a path only
 * that user (and admins) can read.
 */
export async function submitDepositRequest({ amount, method, note, proofFile, referenceId }) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("You must be logged in.");
  if (!(Number(amount) > 0)) throw new Error("Enter a valid deposit amount.");

  let proofUrl = null;
  if (proofFile) {
    const path = `deposit-proofs/${uid}/${Date.now()}_${proofFile.name}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, proofFile);
    proofUrl = await getDownloadURL(storageRef);
  }

  return addDoc(collection(db, "deposits"), {
    uid,
    amount: Number(amount),
    method,
    referenceId: referenceId || null,
    note: note || "",
    proofUrl,
    status: "pending",
    createdAt: serverTimestamp()
  });
}
