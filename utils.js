/**
 * Shared UI + formatting utilities used across the User Panel.
 */
import { APP_CONFIG } from "./config.js";

let toastStack = null;
function ensureToastStack() {
  if (!toastStack) {
    toastStack = document.createElement("div");
    toastStack.className = "toast-stack";
    document.body.appendChild(toastStack);
  }
  return toastStack;
}

/** Show a toast notification. type: 'success' | 'error' | 'info' */
export function toast(message, type = "info", timeout = 4200) {
  const stack = ensureToastStack();
  const el = document.createElement("div");
  el.className = `toast glass ${type}`;
  const icon = { success: "✓", error: "✕", info: "ℹ" }[type] || "ℹ";
  el.innerHTML = `<strong>${icon}</strong><span>${escapeHtml(message)}</span>`;
  stack.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "opacity .3s ease";
    setTimeout(() => el.remove(), 300);
  }, timeout);
}

export function escapeHtml(str = "") {
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
}

export function formatMoney(amount = 0) {
  const n = Number(amount) || 0;
  return `${APP_CONFIG.currencySymbol}${n.toFixed(2)}`;
}

export function formatDate(ts) {
  if (!ts) return "—";
  const date = ts?.toDate ? ts.toDate() : new Date(ts);
  return date.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
  });
}

export function skeletonRows(count = 3, colSpan = 5) {
  return Array.from({ length: count })
    .map(() => `<tr>${Array.from({ length: colSpan }).map(() => `<td><div class="skeleton" style="height:14px;width:80%"></div></td>`).join("")}</tr>`)
    .join("");
}

export function skeletonCards(count = 4) {
  return Array.from({ length: count })
    .map(() => `<div class="chip-card"><div class="skeleton" style="height:60px;margin-bottom:10px"></div><div class="skeleton" style="height:14px;width:60%;margin:0 auto"></div></div>`)
    .join("");
}

export function tagHtml(status) {
  const s = (status || "pending").toLowerCase();
  return `<span class="tag ${s}">${s}</span>`;
}

export function openModal(html) {
  closeModal();
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "active-modal";
  overlay.innerHTML = `<div class="modal-box glass-strong" style="position:relative">
      <button class="modal-close" data-close-modal aria-label="Close">&times;</button>
      ${html}
    </div>`;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target.hasAttribute("data-close-modal")) closeModal();
  });
  document.body.appendChild(overlay);
  return overlay;
}

export function closeModal() {
  document.getElementById("active-modal")?.remove();
}

/** Basic client-side validation helpers (server-side rules are the real gate) */
export const validators = {
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  password: (v) => typeof v === "string" && v.length >= 8,
  notEmpty: (v) => typeof v === "string" && v.trim().length > 0,
  positiveNumber: (v) => !isNaN(v) && Number(v) > 0
};

export function debounce(fn, wait = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export function qs(sel, root = document) { return root.querySelector(sel); }
export function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
