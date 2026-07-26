import { db } from "./config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { watchAuthState } from "./auth.js";
import { fetchPackagesForGame, fetchReviewsForGame } from "./store.js";
import { placeOrder } from "./orders.js";
import { previewCoupon } from "./engagement.js";
import { toggleWishlist, fetchWishlist, submitReview } from "./engagement.js";
import { toast, formatMoney, escapeHtml, formatDate, skeletonCards, openModal, closeModal, qs } from "./utils.js";

const params = new URLSearchParams(location.search);
const gameId = params.get("id");
const preselectPkg = params.get("pkg");

let currentUser = null;
let selectedPackage = null;
let couponDiscount = 0;
let packages = [];

if (!gameId) {
  location.href = "/index.html";
}

watchAuthState((user, profile) => {
  currentUser = user;
  const headerActions = qs("#header-actions");
  if (!user) {
    headerActions.innerHTML = `<a href="/login.html" class="btn btn-sm btn-ghost">Login</a><a href="/register.html" class="btn btn-sm btn-gold">Sign Up</a>`;
  } else {
    headerActions.innerHTML = `<div class="wallet-pill">💰 ${formatMoney(profile?.walletBalance || 0)}</div><a href="/dashboard.html" class="avatar">${(profile?.name || "U").slice(0,1).toUpperCase()}</a>`;
  }
});

async function loadGame() {
  const snap = await getDoc(doc(db, "games", gameId));
  if (!snap.exists()) {
    qs("#game-name").textContent = "Game not found";
    return;
  }
  const game = { id: snap.id, ...snap.data() };
  document.title = `${game.name} Top-Up — Supper Shop`;
  qs("#page-title").textContent = `${game.name} Top-Up — Supper Shop`;
  qs("#game-name").textContent = game.name;
  qs("#game-info").innerHTML = `
    <img src="${game.image || 'https://placehold.co/280x220/123b27/f0be42?text=' + encodeURIComponent(game.name)}" alt="${escapeHtml(game.name)}" style="border-radius:12px;margin-bottom:14px" />
    <h4>${escapeHtml(game.name)}</h4>
    <p class="text-muted mt-8">${escapeHtml(game.category || "")}</p>
    <p class="text-muted mt-16" style="font-size:.85rem">${escapeHtml(game.description || "Top up instantly and securely with your Supper Shop wallet.")}</p>
  `;
  loadReviews(game.id);
}

function packageCardHtml(pkg) {
  const discounted = pkg.discountPrice && pkg.discountPrice < pkg.price;
  const price = discounted ? pkg.discountPrice : pkg.price;
  return `
    <button type="button" class="chip-card" data-id="${pkg.id}" data-price="${price}" data-name="${escapeHtml(pkg.name)}">
      ${discounted ? `<span class="chip-badge">SALE</span>` : ""}
      <div class="chip-denom">${escapeHtml(pkg.name)}</div>
      <div class="chip-price">${discounted ? `<span class="old">${formatMoney(pkg.price)}</span>` : ""}${formatMoney(price)}</div>
    </button>`;
}

async function loadPackages() {
  const grid = qs("#packages-grid");
  grid.innerHTML = skeletonCards(4);
  try {
    packages = await fetchPackagesForGame(gameId);
    grid.innerHTML = packages.length ? packages.map(packageCardHtml).join("") : `<p class="text-muted">No packages available right now.</p>`;
    grid.querySelectorAll(".chip-card").forEach((card) => {
      card.addEventListener("click", () => selectPackage(card));
    });
    if (preselectPkg) {
      const match = grid.querySelector(`[data-id="${preselectPkg}"]`);
      if (match) selectPackage(match);
    }
  } catch (err) {
    console.error(err);
    grid.innerHTML = `<p class="text-muted">Couldn't load packages.</p>`;
  }
}

function selectPackage(card) {
  qs("#packages-grid").querySelectorAll(".chip-card").forEach((c) => c.classList.remove("selected"));
  card.classList.add("selected");
  selectedPackage = { id: card.dataset.id, price: Number(card.dataset.price), name: card.dataset.name };
  qs("#checkout-submit").disabled = false;
  qs("#checkout-submit").textContent = `Pay with Wallet — ${formatMoney(selectedPackage.price)}`;
  updateTotal();
}

function updateTotal() {
  if (!selectedPackage) return;
  const qty = Math.max(1, Number(qs("#quantity").value) || 1);
  let total = selectedPackage.price * qty;
  total = Math.max(0, total - couponDiscount);
  qs("#order-total").textContent = formatMoney(total);
  qs("#checkout-submit").textContent = `Pay with Wallet — ${formatMoney(total)}`;
}

qs("#quantity").addEventListener("input", updateTotal);
qs("#couponCode").addEventListener("blur", async (e) => {
  const code = e.target.value.trim();
  if (!code) { couponDiscount = 0; return updateTotal(); }
  try {
    const coupon = await previewCoupon(code);
    if (!coupon) {
      toast("That coupon code isn't valid or has expired.", "error");
      couponDiscount = 0;
    } else {
      couponDiscount = coupon.type === "percent" ? (selectedPackage?.price || 0) * (coupon.value / 100) : coupon.value;
      toast(`Coupon applied: ${coupon.code}`, "success");
    }
  } catch (err) {
    console.error(err);
  }
  updateTotal();
});

qs("#checkout-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) {
    toast("Please log in to place an order.", "error");
    return (location.href = "/login.html");
  }
  if (!selectedPackage) return toast("Select a package first.", "error");
  const playerId = qs("#playerId").value.trim();
  if (!playerId) return toast("Enter your Player ID.", "error");

  const btn = qs("#checkout-submit");
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = "Processing…";
  try {
    const result = await placeOrder({
      packageId: selectedPackage.id,
      playerId,
      serverId: qs("#serverId").value.trim(),
      quantity: Math.max(1, Number(qs("#quantity").value) || 1),
      couponCode: qs("#couponCode").value.trim() || null
    });
    toast("Order placed! Track it from your dashboard.", "success");
    location.href = `/dashboard.html#orders?highlight=${result.orderId}`;
  } catch (err) {
    console.error(err);
    toast(err.message || "Order failed. Please try again.", "error");
    btn.disabled = false;
    btn.textContent = originalText;
  }
});

qs("#wishlist-btn").addEventListener("click", async () => {
  if (!currentUser) return toast("Log in to save items to your wishlist.", "error");
  const added = await toggleWishlist(currentUser.uid, gameId);
  qs("#wishlist-btn").textContent = added ? "♥ Saved" : "♡ Save";
  toast(added ? "Added to wishlist." : "Removed from wishlist.", "success");
});

async function loadReviews(id) {
  const list = qs("#reviews-list");
  try {
    const reviews = await fetchReviewsForGame(id);
    list.innerHTML = reviews.length
      ? reviews.map((r) => `
        <div class="card glass mb-16">
          <div class="flex-between"><strong>${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</strong><span class="text-muted" style="font-size:.8rem">${formatDate(r.createdAt)}</span></div>
          <p class="mt-8">${escapeHtml(r.comment)}</p>
        </div>`).join("")
      : `<p class="text-muted">No reviews yet — be the first to share your experience.</p>`;
  } catch (err) {
    console.error(err);
  }
}

qs("#write-review-btn").addEventListener("click", () => {
  if (!currentUser) return toast("Log in to write a review.", "error");
  openModal(`
    <h3>Write a review</h3>
    <form id="review-form">
      <div class="form-field">
        <label for="rating">Rating</label>
        <select id="rating">
          <option value="5">★★★★★ Excellent</option>
          <option value="4">★★★★☆ Good</option>
          <option value="3">★★★☆☆ Average</option>
          <option value="2">★★☆☆☆ Poor</option>
          <option value="1">★☆☆☆☆ Terrible</option>
        </select>
      </div>
      <div class="form-field">
        <label for="comment">Your review</label>
        <textarea id="comment" rows="4" required></textarea>
      </div>
      <button class="btn btn-gold btn-block" type="submit">Submit Review</button>
    </form>
  `);
  qs("#review-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await submitReview({ gameId, rating: qs("#rating").value, comment: qs("#comment").value.trim() });
      toast("Thanks! Your review is pending moderation.", "success");
      closeModal();
    } catch (err) {
      toast("Couldn't submit your review.", "error");
    }
  });
});

loadGame();
loadPackages();
