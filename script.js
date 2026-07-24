/* ============================================================
   script.js — NOVARA application logic
   All functions are modular + reusable. Views are rendered by
   a tiny hash router into #app. Firestore is the single data
   source; a small demo dataset fills the UI on first run /
   when Firestore is empty so the store is never blank.
   ============================================================ */

/* ---------- 1. FIREBASE (modular SDK via CDN) ---------- */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, sendPasswordResetEmail, updateProfile,
  GoogleAuthProvider, FacebookAuthProvider, signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc,
  updateDoc, deleteDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let app, auth, db, firebaseReady = false;
try {
  app = initializeApp(window.FIREBASE_CONFIG);
  auth = getAuth(app);
  db = getFirestore(app);
  firebaseReady = true;
} catch (e) {
  console.warn("Firebase not configured yet — running in demo mode.", e);
}

const C = window.COLLECTIONS;
const SITE = { ...window.SITE_DEFAULTS };
let currentUser = null;

/* ---------- 2. STATE ---------- */
const state = {
  products: [],
  categories: [],
  brands: [],
  cart: JSON.parse(localStorage.getItem("nv_cart") || "[]"),
  wishlist: JSON.parse(localStorage.getItem("nv_wishlist") || "[]"),
  compare: JSON.parse(localStorage.getItem("nv_compare") || "[]"),
  recentlyViewed: JSON.parse(localStorage.getItem("nv_recent") || "[]"),
  filters: { category: null, brand: null, minPrice: 0, maxPrice: 100000, rating: 0, color: null, size: null, sort: "featured", q: "" },
  theme: localStorage.getItem("nv_theme") || SITE.defaultTheme
};

/* ---------- 3. DEMO DATA (fallback only) ---------- */
const DEMO_CATEGORIES = [
  { id: "audio", name: "Audio", icon: "🎧" },
  { id: "wearables", name: "Wearables", icon: "⌚" },
  { id: "home", name: "Smart Home", icon: "🏠" },
  { id: "mobility", name: "Mobility", icon: "🛴" },
  { id: "computing", name: "Computing", icon: "💻" },
  { id: "energy", name: "Energy", icon: "🔋" }
];
const DEMO_BRANDS = ["Nyx Labs", "Orbital", "Kestrel", "Halcyon", "Vantablack", "Meridian"];
function genDemoProducts() {
  const names = [
    "Aether Buds Pro", "Halo Ring Tracker", "Nova Desk Lamp", "Glide Board X",
    "Quantum Slate Laptop", "Solar Cell Pack", "Chrono Watch S2", "Pulse Speaker Mini",
    "Drift Scooter Air", "Nimbus VR Visor", "Flux Charging Pad", "Orbit Earbuds",
    "Vertex Keyboard", "Zenith Monitor 4K", "Ember Smart Bulb", "Vapor Backpack"
  ];
  return names.map((n, i) => {
    const price = Math.round((40 + Math.random() * 460) * 100) / 100;
    const onSale = i % 3 === 0;
    return {
      id: "demo-" + i,
      name: n,
      brand: DEMO_BRANDS[i % DEMO_BRANDS.length],
      category: DEMO_CATEGORIES[i % DEMO_CATEGORIES.length].id,
      price: onSale ? Math.round(price * 0.8 * 100) / 100 : price,
      compareAtPrice: onSale ? price : null,
      rating: Math.round((3.5 + Math.random() * 1.5) * 10) / 10,
      reviewCount: Math.floor(Math.random() * 400) + 5,
      stock: Math.floor(Math.random() * 40),
      images: [`https://picsum.photos/seed/nv${i}a/700/700`, `https://picsum.photos/seed/nv${i}b/700/700`, `https://picsum.photos/seed/nv${i}c/700/700`],
      colors: ["#0E1016", "#3EE6E0", "#8B5CF6"].slice(0, (i % 3) + 1),
      sizes: i % 4 === 0 ? ["S", "M", "L"] : [],
      description: `${n} is engineered for the next decade of everyday tech — precision-built, energy efficient, and designed to disappear into your life until the moment you need it.`,
      specs: { "Weight": "128g", "Battery": "36h", "Connectivity": "Wi-Fi 7 / BLE 6", "Warranty": "2 years" },
      tags: i % 5 === 0 ? ["bestseller"] : i % 4 === 0 ? ["new"] : onSale ? ["sale"] : [],
      trending: i % 4 === 0,
      featured: i % 3 === 0
    };
  });
}

/* ---------- 4. UTIL ---------- */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const fmt = (n) => `${SITE.currencySymbol}${Number(n).toFixed(2)}`;
const escapeHtml = (s = "") => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const persist = () => {
  localStorage.setItem("nv_cart", JSON.stringify(state.cart));
  localStorage.setItem("nv_wishlist", JSON.stringify(state.wishlist));
  localStorage.setItem("nv_compare", JSON.stringify(state.compare));
  localStorage.setItem("nv_recent", JSON.stringify(state.recentlyViewed));
};

function toast(msg, type = "info") {
  const wrap = $("#toastWrap");
  const el = document.createElement("div");
  el.className = `toast glass ${type}`;
  el.innerHTML = `<span>${escapeHtml(msg)}</span>`;
  wrap.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transform = "translateX(20px)"; setTimeout(() => el.remove(), 250); }, 3200);
}
window.lazyObserve = () => {
  $$('img[loading="lazy"]:not(.loaded)').forEach(img => {
    if (img.complete) img.classList.add("loaded");
    else img.onload = () => img.classList.add("loaded");
  });
};

/* ---------- 5. THEME ---------- */
function applyTheme(t) {
  state.theme = t;
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem("nv_theme", t);
}
function toggleTheme() { applyTheme(state.theme === "dark" ? "light" : "dark"); }

/* ---------- 6. DATA LAYER (Firestore + fallback) ---------- */
async function loadCatalog() {
  if (firebaseReady) {
    try {
      const [prodSnap, catSnap] = await Promise.all([
        getDocs(collection(db, C.products)),
        getDocs(collection(db, C.categories))
      ]);
      if (!prodSnap.empty) {
        state.products = prodSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        state.categories = catSnap.empty ? DEMO_CATEGORIES : catSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        state.brands = [...new Set(state.products.map(p => p.brand).filter(Boolean))];
        return;
      }
    } catch (e) {
      console.warn("Firestore fetch failed, using demo data:", e.message);
    }
  }
  if (window.FEATURES.demoDataFallback) {
    state.products = genDemoProducts();
    state.categories = DEMO_CATEGORIES;
    state.brands = DEMO_BRANDS;
  }
}

async function saveOrder(order) {
  if (firebaseReady && currentUser) {
    const ref = await addDoc(collection(db, C.orders), {
      ...order, userId: currentUser.uid, createdAt: serverTimestamp(), status: "pending"
    });
    return ref.id;
  }
  // guest / offline fallback — store locally so the confirmation page still works
  const localId = "LOCAL-" + Date.now();
  const orders = JSON.parse(localStorage.getItem("nv_orders") || "[]");
  orders.unshift({ ...order, id: localId, status: "pending", createdAt: new Date().toISOString() });
  localStorage.setItem("nv_orders", JSON.stringify(orders));
  return localId;
}

async function fetchUserOrders() {
  if (firebaseReady && currentUser) {
    try {
      const q = query(collection(db, C.orders), where("userId", "==", currentUser.uid), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) { console.warn(e.message); }
  }
  return JSON.parse(localStorage.getItem("nv_orders") || "[]");
}

/* ---------- 7. AUTH ---------- */
async function handleSignup(name, email, password) {
  if (!firebaseReady) { toast("Connect Firebase in config.js to enable accounts.", "error"); return; }
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  await setDoc(doc(db, C.users, cred.user.uid), { name, email, createdAt: serverTimestamp(), addresses: [], role: "customer" });
  toast("Account created — welcome to NOVARA.", "success");
}
async function handleLogin(email, password) {
  if (!firebaseReady) { toast("Connect Firebase in config.js to enable accounts.", "error"); return; }
  await signInWithEmailAndPassword(auth, email, password);
  toast("Signed in.", "success");
}
async function handleLogout() {
  if (firebaseReady) await signOut(auth);
  toast("Signed out.", "info");
  navigate("home");
}
async function handleForgotPassword(email) {
  if (!firebaseReady) { toast("Connect Firebase in config.js to enable password reset.", "error"); return; }
  await sendPasswordResetEmail(auth, email);
  toast("Password reset email sent.", "success");
}
async function socialLogin(providerName) {
  if (!firebaseReady) { toast("Connect Firebase to enable social login.", "error"); return; }
  const provider = providerName === "google" ? new GoogleAuthProvider() : new FacebookAuthProvider();
  await signInWithPopup(auth, provider);
}
if (firebaseReady) {
  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    renderAuthUI();
  });
}
function renderAuthUI() {
  const btn = $("#userMenuBtn");
  if (!btn) return;
  btn.title = currentUser ? `Signed in as ${currentUser.displayName || currentUser.email}` : "Sign in";
  btn.classList.toggle("logged-in", !!currentUser);
}

/* ---------- 8. CART ---------- */
function addToCart(product, opts = {}) {
  const key = `${product.id}|${opts.color || ""}|${opts.size || ""}`;
  const existing = state.cart.find(c => c.key === key);
  if (existing) existing.qty += (opts.qty || 1);
  else state.cart.push({
    key, id: product.id, name: product.name, price: product.price,
    image: product.images?.[0] || "", color: opts.color || null, size: opts.size || null,
    qty: opts.qty || 1, savedForLater: false
  });
  persist(); renderCartBadge(); renderCartDrawer();
  toast(`${product.name} added to cart.`, "success");
}
function updateCartQty(key, qty) {
  const line = state.cart.find(c => c.key === key);
  if (!line) return;
  line.qty = Math.max(1, qty);
  persist(); renderCartBadge(); renderCartDrawer();
  if (location.hash.startsWith("#/cart")) renderRoute();
}
function removeFromCart(key) {
  state.cart = state.cart.filter(c => c.key !== key);
  persist(); renderCartBadge(); renderCartDrawer();
  if (location.hash.startsWith("#/cart")) renderRoute();
}
function saveForLater(key) {
  const line = state.cart.find(c => c.key === key);
  if (line) line.savedForLater = !line.savedForLater;
  persist(); renderCartDrawer();
  if (location.hash.startsWith("#/cart")) renderRoute();
}
function cartTotals() {
  const active = state.cart.filter(c => !c.savedForLater);
  const subtotal = active.reduce((s, c) => s + c.price * c.qty, 0);
  const shipping = subtotal === 0 || subtotal >= SITE.freeShippingThreshold ? 0 : 6.99;
  const tax = subtotal * SITE.taxRate;
  const discount = window.__appliedCoupon ? window.__appliedCoupon.amount : 0;
  const total = Math.max(0, subtotal + shipping + tax - discount);
  return { subtotal, shipping, tax, discount, total, count: active.reduce((s, c) => s + c.qty, 0) };
}
function renderCartBadge() {
  const n = state.cart.reduce((s, c) => s + c.qty, 0);
  $$(".cart-count").forEach(el => { el.textContent = n; el.style.display = n ? "flex" : "none"; });
  const wn = state.wishlist.length;
  $$(".wish-count").forEach(el => { el.textContent = wn; el.style.display = wn ? "flex" : "none"; });
}

/* ---------- 9. WISHLIST / COMPARE ---------- */
function toggleWishlist(productId) {
  const i = state.wishlist.indexOf(productId);
  if (i > -1) { state.wishlist.splice(i, 1); toast("Removed from wishlist.", "info"); }
  else { state.wishlist.push(productId); toast("Added to wishlist.", "success"); }
  persist(); renderCartBadge();
  $$(`.p-wish[data-id="${productId}"]`).forEach(el => el.classList.toggle("active"));
}
function toggleCompare(productId) {
  const i = state.compare.indexOf(productId);
  if (i > -1) state.compare.splice(i, 1);
  else if (state.compare.length < 4) state.compare.push(productId);
  else { toast("Compare list holds up to 4 products.", "error"); return; }
  persist();
}
function pushRecentlyViewed(id) {
  state.recentlyViewed = [id, ...state.recentlyViewed.filter(x => x !== id)].slice(0, 12);
  persist();
}

/* ---------- 10. SEARCH & FILTER ---------- */
function filteredProducts() {
  let list = [...state.products];
  const f = state.filters;
  if (f.q) {
    const q = f.q.toLowerCase();
    list = list.filter(p => p.name.toLowerCase().includes(q) || (p.brand || "").toLowerCase().includes(q) || (p.category || "").toLowerCase().includes(q));
  }
  if (f.category) list = list.filter(p => p.category === f.category);
  if (f.brand) list = list.filter(p => p.brand === f.brand);
  if (f.color) list = list.filter(p => (p.colors || []).includes(f.color));
  if (f.size) list = list.filter(p => (p.sizes || []).includes(f.size));
  if (f.rating) list = list.filter(p => (p.rating || 0) >= f.rating);
  list = list.filter(p => p.price >= f.minPrice && p.price <= f.maxPrice);
  switch (f.sort) {
    case "price-asc": list.sort((a, b) => a.price - b.price); break;
    case "price-desc": list.sort((a, b) => b.price - a.price); break;
    case "rating": list.sort((a, b) => (b.rating || 0) - (a.rating || 0)); break;
    case "newest": list.reverse(); break;
    default: break;
  }
  return list;
}
function runSearchSuggestions(term) {
  const box = $("#searchSuggest");
  if (!term) { box.classList.remove("show"); return; }
  const matches = state.products.filter(p => p.name.toLowerCase().includes(term.toLowerCase())).slice(0, 6);
  box.innerHTML = matches.length ? matches.map(p => `
    <a class="s-item" href="#/product/${p.id}">
      <img src="${p.images?.[0]}" alt="">
      <span>${escapeHtml(p.name)} <small style="color:var(--text-faint)">— ${fmt(p.price)}</small></span>
    </a>`).join("") : `<div class="s-empty">No products found for "${escapeHtml(term)}"</div>`;
  box.classList.add("show");
}

/* ---------- 11. RENDER HELPERS ---------- */
function stars(rating = 0) {
  const full = Math.round(rating);
  return "★".repeat(full) + "☆".repeat(5 - full);
}
function productCard(p) {
  const wished = state.wishlist.includes(p.id);
  const stockLabel = p.stock === 0 ? '<span class="p-stock out">Out of stock</span>' : p.stock < 6 ? `<span class="p-stock low">Only ${p.stock} left</span>` : '<span class="p-stock">In stock</span>';
  const tag = p.tags?.includes("sale") ? "Sale" : p.tags?.includes("new") ? "New" : p.tags?.includes("bestseller") ? "Bestseller" : "";
  return `
  <article class="card p-card">
    <a href="#/product/${p.id}" class="thumb">
      ${tag ? `<span class="p-tag">${tag}</span>` : ""}
      <img loading="lazy" src="${p.images?.[0]}" alt="${escapeHtml(p.name)}">
      <div class="p-quick">
        <button class="btn btn-primary btn-sm" style="flex:1" onclick="event.preventDefault();window.__addQuick('${p.id}')">Add to cart</button>
      </div>
    </a>
    <button class="p-wish ${wished ? "active" : ""}" data-id="${p.id}" onclick="window.__toggleWish('${p.id}')" aria-label="Toggle wishlist">${wished ? "♥" : "♡"}</button>
    <div class="p-body">
      <span class="p-brand">${escapeHtml(p.brand || "")}</span>
      <a href="#/product/${p.id}" class="p-name">${escapeHtml(p.name)}</a>
      <div class="p-rating">${stars(p.rating)} <span>(${p.reviewCount || 0})</span></div>
      <div class="p-price"><span class="now">${fmt(p.price)}</span>${p.compareAtPrice ? `<span class="old">${fmt(p.compareAtPrice)}</span>` : ""}</div>
      ${stockLabel}
    </div>
  </article>`;
}
window.__addQuick = (id) => { const p = state.products.find(x => x.id === id); if (p) addToCart(p); };
window.__toggleWish = (id) => toggleWishlist(id);

function skeletonGrid(n = 8) {
  return `<div class="product-grid">${Array.from({ length: n }).map(() => `<div class="card skeleton skel-card"></div>`).join("")}</div>`;
}

/* ---------- 12. VIEWS ---------- */
function viewHome() {
  const featured = state.products.filter(p => p.featured).slice(0, 8);
  const trending = state.products.filter(p => p.trending).slice(0, 8);
  const deals = state.products.filter(p => p.tags?.includes("sale")).slice(0, 8);
  const newArrivals = state.products.filter(p => p.tags?.includes("new")).slice(0, 4);
  const bestSellers = state.products.filter(p => p.tags?.includes("bestseller")).slice(0, 4);
  const recent = state.recentlyViewed.map(id => state.products.find(p => p.id === id)).filter(Boolean).slice(0, 4);

  return `
  <section class="hero">
    <div class="container hero-grid">
      <div>
        <span class="hero-eyebrow">⚡ New season · 2060 collection</span>
        <h1>Tech that feels like it arrived <span>from the future</span>.</h1>
        <p>${escapeHtml(SITE.tagline)} Curated devices, wearables and smart-home tech built for the decade ahead — shipped to your door.</p>
        <div class="hero-cta">
          <a href="#/shop" class="btn btn-primary">Shop the collection</a>
          <a href="#/shop?tag=sale" class="btn btn-ghost">View flash sale</a>
        </div>
        <div class="hero-stats">
          <div><b>120k+</b><span>Orders shipped</span></div>
          <div><b>4.8★</b><span>Average rating</span></div>
          <div><b>48h</b><span>Global delivery</span></div>
        </div>
      </div>
      <div class="hero-art">
        <div class="orbit-ring r1"></div><div class="orbit-ring r2"></div>
        <div class="glass"></div>
        <img loading="lazy" src="https://picsum.photos/seed/novarahero/900/900" alt="Featured product">
        <div class="scan-sweep"></div>
      </div>
    </div>
  </section>

  <section class="container">
    <div class="section-head"><div><span class="eyebrow">Browse</span><h2>Featured categories</h2></div></div>
    <div class="cat-grid">
      ${state.categories.map(c => `<a href="#/shop?cat=${c.id}" class="card cat-card"><div class="ic">${c.icon || "🛍️"}</div><span>${escapeHtml(c.name)}</span></a>`).join("")}
    </div>
  </section>

  <section class="container">
    <div class="section-head"><div><span class="eyebrow">Right now</span><h2>Flash sale</h2><p>Ends soon — while stock lasts.</p></div>
      <div class="countdown" id="flashCountdown"></div>
    </div>
    <div class="product-grid">${deals.map(productCard).join("") || '<p style="color:var(--text-faint)">No active deals right now.</p>'}</div>
  </section>

  <section class="container">
    <div class="section-head"><div><span class="eyebrow">Curated</span><h2>Trending products</h2></div><a class="see-all" href="#/shop">See all →</a></div>
    <div class="product-grid">${trending.map(productCard).join("")}</div>
  </section>

  <section class="container">
    <div class="section-head"><div><span class="eyebrow">Loved by shoppers</span><h2>Best sellers</h2></div></div>
    <div class="product-grid">${bestSellers.map(productCard).join("")}</div>
  </section>

  <section class="container">
    <div class="section-head"><div><span class="eyebrow">Just landed</span><h2>New arrivals</h2></div></div>
    <div class="product-grid">${newArrivals.map(productCard).join("")}</div>
  </section>

  <section class="container">
    <div class="section-head"><div><span class="eyebrow">Editor's pick</span><h2>Recommended for you</h2></div></div>
    <div class="product-grid">${featured.map(productCard).join("")}</div>
  </section>

  ${recent.length ? `
  <section class="container">
    <div class="section-head"><div><span class="eyebrow">Continue browsing</span><h2>Recently viewed</h2></div></div>
    <div class="product-grid">${recent.map(productCard).join("")}</div>
  </section>` : ""}

  <section class="container">
    <div class="section-head"><div><span class="eyebrow">Trusted brands</span><h2>Popular brands</h2></div></div>
    <div class="brand-strip">${state.brands.map(b => `<div class="card b-item">${escapeHtml(b)}</div>`).join("")}</div>
  </section
