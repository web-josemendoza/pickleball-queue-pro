/*
 * Background helper for push alerts. Runs even when the
 * app is closed or the phone is locked, and shows the
 * alerts the notifyPlayers Cloud Function sends.
 *
 * Keep the Firebase version in step with package.json.
 */
importScripts("https://www.gstatic.com/firebasejs/12.17.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.17.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAsU9vbzUdroqtuR35yfAeA4_W1V2LdCe8",
  authDomain: "pickleball-queue-pro.firebaseapp.com",
  databaseURL: "https://pickleball-queue-pro-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "pickleball-queue-pro",
  storageBucket: "pickleball-queue-pro.firebasestorage.app",
  messagingSenderId: "443597318715",
  appId: "1:443597318715:web:deb84ab9b5ba6c13138a1e",
});

// Alerts carry a `notification` payload, so Firebase shows
// them automatically while the app is in the background,
// and opens the app when one is tapped.
firebase.messaging();
