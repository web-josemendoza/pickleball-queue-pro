import {
  onAuthStateChanged,
  signOut,
  type User,
} from "firebase/auth";

import { auth } from "./firebaseAuth";

export function subscribeToAuth(
  callback: (user: User | null) => void
) {
  return onAuthStateChanged(auth, callback);
}

export async function logout() {
  await signOut(auth);
}