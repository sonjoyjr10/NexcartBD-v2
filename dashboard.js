import { auth, db } from "./config.js";
import { watchAuthState, logoutUser, resendVerificationEmail } from "./auth.js";
import { watchWallet, fetchWalletTransactions, fetchMyDeposits, submitDepositRequest } from "./wallet.js";
import { fetchMyOrders, fetchOrderById, requestRefund } from "./orders.js";
import { createTicket, replyToTicket, fetchMyTickets } from "./tickets.js";
import {
  fetchReferralStats, watchNotifications, markNotificationRead, fetchWishlist
} from "./engagement.js";
import { doc, getDoc, collection, getDocs, updateDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  toast, formatMoney, formatDate, escapeHtml, tagHtml, skeletonRows, openModal, closeModal, qs, qsa, validators
} from "./utils.js";

let user = null;
let profile = null;
const content = qs("#dash-content");

watchAuthState((u, p) => {
  if (!u) return (location.href = "/login.html");
  user = u; profile = p;
  renderHeader();
  route();
});

function renderHeader() {
  qs("#header-actions").innerHTML = `
    <div class="wallet-pill">💰 ${formatMoney(profile?.walletBalance || 0)}</div>
    <a href="/dashboard.html" class="avatar">${(profile?.name || "U").slice(0,1).toUpperCase()}</a>
  `;
}

qs("#logout-link").addEventListener("click", async (e) => {
  e.preventDefault();
  await logoutUser();
  location.href = "/index.html";
});

window.addEventListener("hashchange", route);

function currentTab() {
  return (location.hash.replace("#", "").split("?")[0]) || "overview";
}

function setActiveNav(tab) {
  qsa("#dash-nav a[data-tab]").forEach((a) => a.classList.toggle("active", a.dataset.tab === tab));
}

async function route() {
  const tab = currentTab();
  setActiveNav(tab);
  const renderers = {
    overview: renderOverview,
    wallet: renderWallet,
    orders: renderOrders,
    wishlist: renderWishlist,
    referral: renderReferral,
    tickets: renderTickets,
    notifications: renderNotifications,
    profile: renderProfile
  };
  (renderers[tab] || renderOverview)();
}

/* ============================== OVERVIEW ============================== */
async function renderOverview() {
  content.innerHTML = `<h1>Welcome, ${escapeHtml(profile?.name || "there")} 👋</h1>
    <div class="grid grid-4" id="overview-stats">
      ${Array.from({length:4}).map(()=>`<div class="stat-card glass"><div class="skeleton" style="height:40px"></div></div>`).join("")}
    </div>
    <div class="section-head mt-32"><h3>Recent orders</h3><a href="#orders" class="btn btn-sm btn-outline">View all</a></div>
    <div class="table-wrap glass" id="overview-orders"><table><tbody>${skeletonRows(3,4)}</tbody></table></div>
    ${!user.emailVerified ? `<div class="card glass mt-24" style="border-color:var(--gold)">
      <strong class="text-gold">Verify your email</strong>
      <p class="text-muted mt-8">Please verify your email to unlock deposits and full account features.</p>
      <button class="btn btn-sm btn-gold mt-16" id="resend-verify-btn">Resend Verification Email</button>
    </div>` : ""}
  `;
  qs("#resend-verify-btn")?.addEventListener("click", () => resendVerificationEmail());

  const [orders, deposits] = await Promise.all([fetchMyOrders(user.uid, 5), fetchMyDeposits(user.uid, 20)]);
  const totalSpent = orders.filter(o=>o.status==="completed").reduce((s,o)=>s+(o.amount||0),0);

  qs("#overview-stats").innerHTML = `
    <div class="stat-card glass"><span class="stat-label">Wallet Balance</span><span class="stat-value mono">${formatMoney(profile?.walletBalance||0)}</span></div>
    <div class="stat-card glass"><span class="stat-label">Reward Points</span><span class="stat-value mono">${profile?.rewardPoints||0}</span></div>
    <div class="stat-card glass"><span class="stat-label">Total Orders</span><span class="stat-value mono">${orders.length}</span></div>
    <div class="stat-card glass"><span class="stat-label">Total Spent</span><span class="stat-value mono">${formatMoney(totalSpent)}</span></div>
  `;

  qs("#overview-orders").innerHTML = orders.length ? `<table><thead><tr><th>Order</th><th>Package</th><th>Amount</th><th>Status</th></tr></thead>
    <tbody>${orders.map(o=>`<tr><td class="mono">#${o.id.slice(0,8)}</td><td>${escapeHtml(o.packageName||"—")}</td><td class="mono">${formatMoney(o.amount)}</td><td>${tagHtml(o.status)}</td></tr>`).join("")}</tbody></table>`
    : `<div class="empty-state"><div class="icon">🧾</div><p>No orders yet. <a href="/index.html" class="text-gold">Browse games</a> to get started.</p></div>`;
}

/* ============================== WALLET ============================== */
async function renderWallet() {
  content.innerHTML = `
    <h1>Wallet</h1>
    <div class="grid grid-2" style="align-items:start">
      <div class="stat-card glass"><span class="stat-label">Current Balance</span><span class="stat-value mono" id="wallet-balance">${formatMoney(profile?.walletBalance||0)}</span>
        <button class="btn btn-gold mt-16" id="deposit-btn">+ Deposit Funds</button>
      </div>
      <div class="stat-card glass"><span class="stat-label">Reward Points</span><span class="stat-value mono">${profile?.rewardPoints||0}</span></div>
    </div>
    <div class="section-head mt-32"><h3>Transaction history</h3></div>
    <div class="table-wrap glass" id="tx-table"><table><tbody>${skeletonRows(5,4)}</tbody></table></div>
    <div class="section-head mt-32"><h3>Deposit requests</h3></div>
    <div class="table-wrap glass" id="deposit-table"><table><tbody>${skeletonRows(3,4)}</tbody></table></div>
  `;

  watchWallet(user.uid, (w) => { qs("#wallet-balance").textContent = formatMoney(w.balance); });

  const [txs, deposits] = await Promise.all([fetchWalletTransactions(user.uid), fetchMyDeposits(user.uid)]);
  qs("#tx-table").innerHTML = txs.length ? `<table><thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Description</th></tr></thead>
    <tbody>${txs.map(t=>`<tr><td>${formatDate(t.createdAt)}</td><td>${tagHtml(t.type)}</td><td class="mono">${t.type==="credit"?"+":"-"}${formatMoney(t.amount)}</td><td>${escapeHtml(t.description||"—")}</td></tr>`).join("")}</tbody></table>`
    : `<div class="empty-state"><div class="icon">💳</div><p>No transactions yet.</p></div>`;

  qs("#deposit-table").innerHTML = deposits.length ? `<table><thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Status</th></tr></thead>
    <tbody>${deposits.map(d=>`<tr><td>${formatDate(d.createdAt)}</td><td class="mono">${formatMoney(d.amount)}</td><td>${escapeHtml(d.method)}</td><td>${tagHtml(d.status)}</td></tr>`).join("")}</tbody></table>`
    : `<div class="empty-state"><div class="icon">📥</div><p>No deposit requests yet.</p></div>`;

  qs("#deposit-btn").addEventListener("click", openDepositModal);
}

function openDepositModal() {
  openModal(`
    <h3>Deposit funds</h3>
    <p class="text-muted mb-16" style="font-size:.85rem">Your wallet is credited only after an admin verifies your payment — this usually takes a few minutes.</p>
    <form id="deposit-form">
      <div class="form-field">
        <label for="dep-amount">Amount (USD)</label>
        <input type="number" id="dep-amount" min="1" step="0.01" required />
      </div>
      <div class="form-field">
        <label for="dep-method">Payment method</label>
        <select id="dep-method">
          <option value="bank_transfer">Bank Transfer</option>
          <option value="card">Card</option>
          <option value="mobile_wallet">Mobile Wallet (bKash/Nagad/etc.)</option>
          <option value="crypto">Crypto</option>
        </select>
      </div>
      <div class="form-field">
        <label for="dep-ref">Transaction / Reference ID</label>
        <input type="text" id="dep-ref" placeholder="e.g. bank reference number" />
      </div>
      <div class="form-field">
        <label for="dep-proof">Payment proof (screenshot, optional)</label>
        <input type="file" id="dep-proof" accept="image/*" />
      </div>
      <div class="form-field">
        <label for="dep-note">Note (optional)</label>
        <textarea id="dep-note" rows="2"></textarea>
      </div>
      <button class="btn btn-gold btn-block" type="submit">Submit Deposit Request</button>
    </form>
  `);
  qs("#deposit-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await submitDepositRequest({
        amount: qs("#dep-amount").value,
        method: qs("#dep-method").value,
        referenceId: qs("#dep-ref").value.trim(),
        note: qs("#dep-note").value.trim(),
        proofFile: qs("#dep-proof").files[0] || null
      });
      toast("Deposit request submitted — awaiting verification.", "success");
      closeModal();
      renderWallet();
    } catch (err) {
      toast(err.message || "Couldn't submit deposit request.", "error");
    }
  });
}

/* ============================== ORDERS ============================== */
async function renderOrders() {
  content.innerHTML = `<h1>Order History</h1><div class="table-wrap glass" id="orders-table"><table><tbody>${skeletonRows(6,5)}</tbody></table></div>`;
  const orders = await fetchMyOrders(user.uid);
  qs("#orders-table").innerHTML = orders.length ? `<table><thead><tr><th>Order</th><th>Package</th><th>Qty</th><th>Amount</th><th>Status</th><th></th></tr></thead>
    <tbody>${orders.map(o=>`<tr>
      <td class="mono">#${o.id.slice(0,8)}</td>
      <td>${escapeHtml(o.packageName||"—")}<div class="text-muted" style="font-size:.75rem">${formatDate(o.createdAt)}</div></td>
      <td>${o.quantity||1}</td>
      <td class="mono">${formatMoney(o.amount)}</td>
      <td>${tagHtml(o.status)}</td>
      <td><button class="btn btn-sm btn-outline" data-order-detail="${o.id}">Details</button></td>
    </tr>`).join("")}</tbody></table>`
    : `<div class="empty-state"><div class="icon">🧾</div><p>No orders yet. <a href="/index.html" class="text-gold">Browse games</a> to get started.</p></div>`;

  qsa("[data-order-detail]").forEach((btn) => btn.addEventListener("click", () => showOrderDetail(btn.dataset.orderDetail)));
}

async function showOrderDetail(orderId) {
  const order = await fetchOrderById(orderId);
  if (!order) return toast("Order not found.", "error");
  openModal(`
    <h3>Order #${orderId.slice(0,8)}</h3>
    <div class="mt-16"><span class="text-muted">Status</span><div>${tagHtml(order.status)}</div></div>
    <div class="mt-16"><span class="text-muted">Package</span><div>${escapeHtml(order.packageName||"—")}</div></div>
    <div class="mt-16"><span class="text-muted">Player ID</span><div class="mono">${escapeHtml(order.playerId||"—")}</div></div>
    <div class="mt-16"><span class="text-muted">Amount charged</span><div class="mono text-gold">${formatMoney(order.amount)}</div></div>
    <div class="mt-16"><span class="text-muted">Placed</span><div>${formatDate(order.createdAt)}</div></div>
    ${order.status === "completed" ? `<button class="btn btn-outline btn-block mt-24" id="refund-btn">Request Refund</button>` : ""}
  `);
  qs("#refund-btn")?.addEventListener("click", async () => {
    const reason = prompt("Briefly describe the issue with this order:");
    if (!reason) return;
    try {
      await requestRefund(orderId, reason);
      toast("Refund request submitted.", "success");
      closeModal();
    } catch (err) {
      toast(err.message || "Couldn't submit refund request.", "error");
    }
  });
}

/* ============================== WISHLIST ============================== */
async function renderWishlist() {
  content.innerHTML = `<h1>Wishlist</h1><div class="grid grid-4" id="wishlist-grid">${skeletonRows(1,1)}</div>`;
  const gameIds = await fetchWishlist(user.uid);
  if (!gameIds.length) {
    content.querySelector("#wishlist-grid").outerHTML = `<div class="empty-state"><div class="icon">♥</div><p>Nothing saved yet. Tap "Save" on any game page to add it here.</p></div>`;
    return;
  }
  const games = await Promise.all(gameIds.map((id) => getDoc(doc(db, "games", id))));
  qs("#wishlist-grid").innerHTML = games.filter(g=>g.exists()).map((g) => {
    const game = g.data();
    return `<a class="game-card glass" href="/game.html?id=${g.id}">
      <img src="${game.image || 'https://placehold.co/300x400/123b27/f0be42?text='+encodeURIComponent(game.name)}" alt="${escapeHtml(game.name)}" />
      <div class="overlay"><h4>${escapeHtml(game.name)}</h4></div>
    </a>`;
  }).join("");
}

/* ============================== REFERRAL ============================== */
async function renderReferral() {
  content.innerHTML = `<h1>Referral Program</h1><div class="card glass">${skeletonRows(1,1)}</div>`;
  const stats = await fetchReferralStats(user.uid);
  const link = `${location.origin}/register.html?ref=${stats.code}`;
  content.innerHTML = `
    <h1>Referral Program</h1>
    <div class="card glass">
      <p class="text-muted">Share your link — you and your friend both earn wallet bonus credit when they make their first deposit.</p>
      <div class="flex gap-12 mt-16" style="flex-wrap:wrap">
        <input class="mono" readonly value="${link}" style="flex:1;min-width:220px;padding:12px 16px;border-radius:10px;background:rgba(255,255,255,.04);border:1px solid var(--glass-border)" id="ref-link-input" />
        <button class="btn btn-gold" id="copy-ref-btn">Copy Link</button>
      </div>
    </div>
    <div class="grid grid-2 mt-24">
      <div class="stat-card glass"><span class="stat-label">Your Code</span><span class="stat-value mono">${stats.code}</span></div>
      <div class="stat-card glass"><span class="stat-label">Friends Referred</span><span class="stat-value mono">${stats.referredCount}</span></div>
    </div>
  `;
  qs("#copy-ref-btn").addEventListener("click", () => {
    navigator.clipboard.writeText(link);
    toast("Referral link copied!", "success");
  });
}

/* ============================== TICKETS ============================== */
async function renderTickets() {
  content.innerHTML = `<div class="section-head"><h1>Support Tickets</h1><button class="btn btn-gold btn-sm" id="new-ticket-btn">+ New Ticket</button></div>
    <div id="tickets-list">${skeletonRows(3,1)}</div>`;
  qs("#new-ticket-btn").addEventListener("click", openNewTicketModal);
  await loadTickets();
}

async function loadTickets() {
  const tickets = await fetchMyTickets(user.uid);
  qs("#tickets-list").innerHTML = tickets.length ? tickets.map((t) => `
    <div class="card glass mb-16">
      <div class="flex-between"><strong>${escapeHtml(t.subject)}</strong>${tagHtml(t.status)}</div>
      <p class="text-muted mt-8" style="font-size:.85rem">${t.messages.length} message(s) · updated ${formatDate(t.updatedAt)}</p>
      <button class="btn btn-sm btn-outline mt-16" data-ticket-id="${t.id}">Open Conversation</button>
    </div>`).join("") : `<div class="empty-state"><div class="icon">💬</div><p>No support tickets yet.</p></div>`;
  qsa("[data-ticket-id]").forEach((btn) => btn.addEventListener("click", () => openTicketThread(tickets.find(t=>t.id===btn.dataset.ticketId))));
}

function openNewTicketModal() {
  openModal(`
    <h3>New support ticket</h3>
    <form id="new-ticket-form">
      <div class="form-field"><label for="t-subject">Subject</label><input type="text" id="t-subject" required /></div>
      <div class="form-field"><label for="t-message">Message</label><textarea id="t-message" rows="4" required></textarea></div>
      <button class="btn btn-gold btn-block" type="submit">Submit Ticket</button>
    </form>
  `);
  qs("#new-ticket-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await createTicket({ subject: qs("#t-subject").value.trim(), message: qs("#t-message").value.trim() });
      toast("Ticket submitted. Our team will respond soon.", "success");
      closeModal();
      loadTickets();
    } catch (err) {
      toast("Couldn't submit ticket.", "error");
    }
  });
}

function openTicketThread(ticket) {
  if (!ticket) return;
  openModal(`
    <h3>${escapeHtml(ticket.subject)}</h3>
    <div style="max-height:280px;overflow-y:auto" class="mt-16">
      ${ticket.messages.map(m => `<div class="mb-16"><strong>${m.sender==="admin"?"Support":"You"}</strong><p class="text-muted" style="font-size:.9rem">${escapeHtml(m.text)}</p></div>`).join("")}
    </div>
    <form id="reply-form" class="mt-16">
      <textarea id="reply-text" rows="3" placeholder="Type a reply…" required></textarea>
      <button class="btn btn-gold btn-block mt-16" type="submit">Send Reply</button>
    </form>
  `);
  qs("#reply-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await replyToTicket(ticket.id, qs("#reply-text").value.trim());
      toast("Reply sent.", "success");
      closeModal();
      loadTickets();
    } catch (err) {
      toast("Couldn't send reply.", "error");
    }
  });
}

/* ============================== NOTIFICATIONS ============================== */
function renderNotifications() {
  content.innerHTML = `<h1>Notifications</h1><div id="notif-list">${skeletonRows(4,1)}</div>`;
  watchNotifications(user.uid, (notifs) => {
    qs("#notif-list").innerHTML = notifs.length ? notifs.map((n) => `
      <div class="card glass mb-12" style="${n.read ? "" : "border-color:var(--gold)"}">
        <div class="flex-between"><strong>${escapeHtml(n.title)}</strong><span class="text-muted" style="font-size:.75rem">${formatDate(n.createdAt)}</span></div>
        <p class="text-muted mt-8">${escapeHtml(n.body)}</p>
        ${!n.read ? `<button class="btn btn-sm btn-ghost mt-8" data-mark-read="${n.id}">Mark as read</button>` : ""}
      </div>`).join("") : `<div class="empty-state"><div class="icon">🔔</div><p>You're all caught up.</p></div>`;
    qsa("[data-mark-read]").forEach((btn) => btn.addEventListener("click", () => markNotificationRead(btn.dataset.markRead)));
  });
}

/* ============================== PROFILE ============================== */
function renderProfile() {
  content.innerHTML = `
    <h1>Profile</h1>
    <form class="card glass" id="profile-form" style="max-width:480px">
      <div class="form-field"><label for="p-name">Full name</label><input type="text" id="p-name" value="${escapeHtml(profile?.name||"")}" required /></div>
      <div class="form-field"><label for="p-phone">Phone</label><input type="text" id="p-phone" value="${escapeHtml(profile?.phone||"")}" /></div>
      <div class="form-field"><label>Email</label><input type="email" value="${escapeHtml(profile?.email||"")}" disabled /></div>
      <button class="btn btn-gold" type="submit">Save Changes</button>
    </form>
  `;
  qs("#profile-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = qs("#p-name").value.trim();
    if (!validators.notEmpty(name)) return toast("Name can't be empty.", "error");
    try {
      await updateDoc(doc(db, "users", user.uid), { name, phone: qs("#p-phone").value.trim() });
      profile.name = name;
      toast("Profile updated.", "success");
      renderHeader();
    } catch (err) {
      toast("Couldn't update profile.", "error");
    }
  });
}
