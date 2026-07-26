import { watchAuthState } from "./auth.js";
import { fetchPublishedBlogs } from "./store.js";
import { formatMoney, formatDate, escapeHtml, skeletonCards, qs } from "./utils.js";

watchAuthState((user, profile) => {
  const el = qs("#header-actions");
  if (!user) el.innerHTML = `<a href="/login.html" class="btn btn-sm btn-ghost">Login</a><a href="/register.html" class="btn btn-sm btn-gold">Sign Up</a>`;
  else el.innerHTML = `<div class="wallet-pill">💰 ${formatMoney(profile?.walletBalance||0)}</div><a href="/dashboard.html" class="avatar">${(profile?.name||"U").slice(0,1).toUpperCase()}</a>`;
});

async function load() {
  const grid = qs("#blog-grid");
  grid.innerHTML = skeletonCards(6);
  try {
    const posts = await fetchPublishedBlogs(12);
    grid.innerHTML = posts.length ? posts.map((p) => `
      <a class="card glass" href="/blog-post.html?id=${p.id}">
        <img src="${p.coverImage || 'https://placehold.co/400x220/123b27/f0be42?text=Supper+Shop'}" alt="${escapeHtml(p.title)}" style="border-radius:10px;margin-bottom:14px" />
        <h4>${escapeHtml(p.title)}</h4>
        <p class="text-muted mt-8" style="font-size:.8rem">${formatDate(p.createdAt)}</p>
      </a>`).join("") : `<p class="text-muted">No posts published yet.</p>`;
  } catch (err) {
    console.error(err);
    grid.innerHTML = `<p class="text-muted">Couldn't load posts.</p>`;
  }
}
load();
