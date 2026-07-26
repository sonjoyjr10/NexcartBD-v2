/* Firebase Cloud Messaging background service worker.
   Must live at the site root (not /js/) so its scope covers the whole origin. */
importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js");

// Duplicated minimal config on purpose: service workers can't import ES
// modules from config.js in all browsers, so only the public (non-secret)
// Firebase config fields are repeated here. Keep these two in sync.
firebase.initializeApp({
  apiKey: "REPLACE_WITH_YOUR_FIREBASE_API_KEY",
  authDomain: "REPLACE_WITH_YOUR_PROJECT.firebaseapp.com",
  projectId: "REPLACE_WITH_YOUR_PROJECT_ID",
  storageBucket: "REPLACE_WITH_YOUR_PROJECT.appspot.com",
  messagingSenderId: "REPLACE_WITH_YOUR_SENDER_ID",
  appId: "REPLACE_WITH_YOUR_APP_ID"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body, icon } = payload.notification || {};
  self.registration.showNotification(title || "Supper Shop", {
    body: body || "",
    icon: icon || "/assets/icons/favicon.svg"
  });
});
