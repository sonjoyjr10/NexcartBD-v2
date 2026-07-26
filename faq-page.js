import { watchAuthState } from "./auth.js";
import { formatMoney, qs } from "./utils.js";

watchAuthState((user, profile) => {
  const el = qs("#header-actions");
  if (!user) el.innerHTML = `<a href="/login.html" class="btn btn-sm btn-ghost">Login</a><a href="/register.html" class="btn btn-sm btn-gold">Sign Up</a>`;
  else el.innerHTML = `<div class="wallet-pill">💰 ${formatMoney(profile?.walletBalance||0)}</div><a href="/dashboard.html" class="avatar">${(profile?.name||"U").slice(0,1).toUpperCase()}</a>`;
});
