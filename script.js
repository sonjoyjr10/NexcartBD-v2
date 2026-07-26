/**
 * Entry point for index.html (the storefront home page).
 */
import { watchAuthState, logoutUser } from "./auth.js";
import { fetchActiveGames, fetchFeaturedPackages, filterGames } from "./store.js";
import { toast, escapeHtml, formatMoney, skeletonCards, debounce, qs, qsa } from "./utils.js";

const gamesGrid = qs("#games-grid");
const featuredGrid = qs("#featured-grid");
const categoryRail = qs("#category-rail");
const gamesEmpty = qs("#games-empty");
const headerActions = qs("#header-actions");

let allGames = [];

/* ---------------- Header / auth state ---------------- */
function renderGuestHeader() {
  headerActions.innerHTML = `
    <a href="/login.html" class="btn btn-sm btn-ghost">Login</a>
    <a href="/register.html" class="btn btn-sm btn-gold">Sign Up</a>
    <button class="hamburger icon-btn" id="hamburger-btn" aria-label="Menu">☰</button>
  `;
}

function renderUserHeader(user, profile) {
  const initials = (profile?.name || user.displayName || user.email || "U").slice(0, 1).toUpperCase();
  headerActions.innerHTML = `
    <div class="wallet-pill">💰 ${formatMoney(profile?.walletBalance || 0)}</div>
    <a href="/dashboard.html#notifications" class="icon-btn" aria-label="Notifications">🔔</a>
    <a href="/dashboard.html" class="avatar" title="${escapeHtml(profile?.name || "")}">${initials}</a>
    <button class="hamburger icon-btn" id="hamburger-btn" aria-label="Menu">☰</button>
  `;
}

watchAuthState((user, profile) => {
  if (!user) return renderGuestHeader();
  renderUserHeader(user, profile);
});

/* ---------------- Catalog rendering ---------------- */
function gameCardHtml(game) {
  return `
    <a class="game-card glass" href="/game.html?id=${game.id}" data-name="${escapeHtml(game.name)}">
      <img src="${game.image || 'https://placehold.co/300x400/123b27/f0be42?text=' + encodeURIComponent(game.name)}" alt="${escapeHtml(game.name)}" loading="lazy" />
      <div class="overlay">
        <div>
          <h4>${escapeHtml(game.name)}</h4>
          <span>${escapeHtml(game.category || "Top-up")}</span>
        </div>
      </div>
    </a>`;
}

function packageCardHtml(pkg) {
  const discounted = pkg.discountPrice && pkg.discountPrice < pkg.price;
  return `
    <a class="chip-card" href="/game.html?id=${pkg.gameId}&pkg=${pkg.id}">
      ${discounted ? `<span class="chip-badge">SALE</span>` : ""}
      <div class="chip-denom">${escapeHtml(pkg.name)}</div>
      <div class="chip-price">
        ${discounted ? `<span class="old">${formatMoney(pkg.price)}</span>` : ""}
        ${formatMoney(discounted ? pkg.discountPrice : pkg.price)}
      </div>
    </a>`;
}

async function loadGames() {
  gamesGrid.innerHTML = skeletonCards(8);
  try {
    allGames = await fetchActiveGames();
    renderCategoryRail(allGames);
    renderGames(allGames);
  } catch (err) {
    console.error(err);
    gamesGrid.innerHTML = "";
    gamesEmpty.classList.remove("hidden");
    toast("Couldn't load games right now. Please refresh.", "error");
  }
}

function renderCategoryRail(games) {
  const cats = Array.from(new Set(games.map((g) => g.category).filter(Boolean)));
  categoryRail.innerHTML = `<button class="cat-chip active" data-cat="all">All</button>` +
    cats.map((c) => `<button class="cat-chip" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join("");
  qsa(".cat-chip", categoryRail).forEach((btn) => {
    btn.addEventListener("click", () => {
      qsa(".cat-chip", categoryRail).forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const cat = btn.dataset.cat;
      renderGames(cat === "all" ? allGames : allGames.filter((g) => g.category === cat));
    });
  });
}

function renderGames(games) {
  if (!games.length) {
    gamesGrid.innerHTML = "";
    gamesEmpty.classList.remove("hidden");
    return;
  }
  gamesEmpty.classList.add("hidden");
  gamesGrid.innerHTML = games.map(gameCardHtml).join("");
}

async function loadFeatured() {
  featuredGrid.innerHTML = skeletonCards(4);
  try {
    const pkgs = await fetchFeaturedPackages(8);
    featuredGrid.innerHTML = pkgs.length
      ? pkgs.map(packageCardHtml).join("")
      : `<p class="text-muted">Featured packages will appear here soon.</p>`;
  } catch (err) {
    console.error(err);
    featuredGrid.innerHTML = `<p class="text-muted">Couldn't load featured packages.</p>`;
  }
}

/* ---------------- Search ---------------- */
qs("#hero-search-form")?.addEventListener("submit", (e) => {
  e.preventDefault();
  const term = qs("#hero-search-input").value;
  renderGames(filterGames(allGames, term));
  qs("#catalog").scrollIntoView({ behavior: "smooth" });
});
qs("#hero-search-input")?.addEventListener("input", debounce((e) => {
  renderGames(filterGames(allGames, e.target.value));
}, 250));

loadGames();
loadFeatured();
