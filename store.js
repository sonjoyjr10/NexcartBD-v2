/**
 * Storefront catalog — reads-only from Firestore. Prices shown here are for
 * display purposes only; the authoritative price check happens server-side
 * inside the `placeOrder` Cloud Function so a tampered client can never buy
 * at a modified price.
 */
import { db } from "./config.js";
import {
  collection, query, where, orderBy, limit, getDocs
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export async function fetchActiveGames() {
  const q = query(collection(db, "games"), where("status", "==", "active"), orderBy("order", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function fetchPackagesForGame(gameId) {
  const q = query(
    collection(db, "packages"),
    where("gameId", "==", gameId),
    where("status", "==", "active"),
    orderBy("price", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function fetchFeaturedPackages(max = 8) {
  const q = query(
    collection(db, "packages"),
    where("status", "==", "active"),
    where("featured", "==", true),
    limit(max)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Simple client-side search across already-fetched games (catalog is small
 *  enough to filter in-memory; for large catalogs swap in Algolia/Typesense
 *  via a Cloud Function-backed search index). */
export function filterGames(games, term) {
  const t = term.trim().toLowerCase();
  if (!t) return games;
  return games.filter((g) => g.name.toLowerCase().includes(t) || (g.category || "").toLowerCase().includes(t));
}

export async function fetchReviewsForGame(gameId, max = 10) {
  const q = query(
    collection(db, "reviews"),
    where("gameId", "==", gameId),
    where("status", "==", "approved"),
    orderBy("createdAt", "desc"),
    limit(max)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function fetchPublishedBlogs(max = 6) {
  const q = query(
    collection(db, "blogs"),
    where("status", "==", "published"),
    orderBy("createdAt", "desc"),
    limit(max)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function fetchFaqs() {
  const snap = await getDocs(query(collection(db, "faqs"), orderBy("order", "asc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
