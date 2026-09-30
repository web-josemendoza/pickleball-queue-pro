import { initializeApp, getApps, getApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectDatabaseEmulator, getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyAsU9vbzUdroqtuR35yfAeA4_W1V2LdCe8",
  authDomain: "pickleball-queue-pro.firebaseapp.com",
  databaseURL: "https://pickleball-queue-pro-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "pickleball-queue-pro",
  storageBucket: "pickleball-queue-pro.firebasestorage.app",
  messagingSenderId: "443597318715",
  appId: "1:443597318715:web:deb84ab9b5ba6c13138a1e"
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getDatabase(app);

// `npm run dev:emulator` points the app at the local
// Firebase emulators so testing never touches real data.
if (import.meta.env.VITE_USE_EMULATOR === "true") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", {
    disableWarnings: true,
  });
  connectDatabaseEmulator(db, "127.0.0.1", 9000);
}
export default app;