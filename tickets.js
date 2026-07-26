import { auth, db } from "./config.js";
import {
  collection, query, where, orderBy, addDoc, updateDoc, doc, arrayUnion, getDocs, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export async function createTicket({ subject, message, orderId }) {
  const uid = auth.currentUser?.uid;
  const user = auth.currentUser;
  return addDoc(collection(db, "tickets"), {
    uid,
    subject,
    orderId: orderId || null,
    status: "open",
    messages: [{ sender: "user", senderName: user?.displayName || "You", text: message, at: Timestamp.now() }],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function replyToTicket(ticketId, message) {
  const user = auth.currentUser;
  return updateDoc(doc(db, "tickets", ticketId), {
    messages: arrayUnion({ sender: "user", senderName: user?.displayName || "You", text: message, at: Timestamp.now() }),
    status: "open",
    updatedAt: serverTimestamp()
  });
}

export async function fetchMyTickets(uid) {
  const q = query(collection(db, "tickets"), where("uid", "==", uid), orderBy("updatedAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
