import { db } from "./config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { watchAuthState } from "./auth.js";
import { formatMoney, formatDate, escapeHtml, qs } from "./utils.js";

watchAuthState((user, profile) => {
  const el = qs("#header-actions");
  if (!user) el.innerHTML = `<a href="/login.html" class="btn btn-sm btn-ghost">Login</a><a href="/register.html" class="btn btn-sm btn-gold">Sign Up</a>`;
  else el.innerHTML = `<div class="wallet-pill">💰 ${formatMoney(profile?.walletBalance||0)}</div><a href="/dashboard.html" class="avatar">${(profile?.name||"U").slice(0,1).toUpperCase()}</a>`;
});

const id = new URLSearchParams(location.search).get("id");
async function load() {
  if (!id) return;
  const snap = await getDoc(doc(db, "blogs", id));
  if (!snap.exists()) {
    qs("#post-content").innerHTML = `<p class="text-muted">Post not found.</p>`;
    return;
  }
  const post = snap.data();
  document.title = `${post.title} — Supper Shop`;
  qs("#page-title").textContent = `${post.title} — Supper Shop`;
  qs("#post-content").innerHTML = `
    <h1>${escapeHtml(post.title)}</h1>
    <p class="text-muted mt-8 mb-24">${formatDate(post.createdAt)}</p>
    ${post.coverImage ? `<img src="${post.coverImage}" alt="" style="border-radius:14px;margin-bottom:24px" />` : ""}
    <div style="line-height:1.8">${post.content}</div>
  `;
}
load();
