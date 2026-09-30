import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";

import { auth } from "./firebaseAuth";

import {
  createPlayerProfile,
  type SkillLevel,
} from "./player";

export async function registerWithEmail(
  name: string,
  email: string,
  phone: string,
  password: string,
  skillLevel: SkillLevel
) {
  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();
  const cleanPhone = phone.trim();

  if (!cleanName) {
    throw new Error("Please enter your name.");
  }

  if (!cleanEmail) {
    throw new Error("Please enter your email.");
  }

  if (!cleanPhone) {
    throw new Error("Please enter your phone number.");
  }

  if (password.length < 6) {
    throw new Error(
      "Password must be at least 6 characters."
    );
  }

  const credential =
    await createUserWithEmailAndPassword(
      auth,
      cleanEmail,
      password
    );

  await updateProfile(credential.user, {
    displayName: cleanName,
  });

  const now = Date.now();

  await createPlayerProfile({
    playerId: credential.user.uid,
    name: cleanName,
    email: cleanEmail,
    phone: cleanPhone,
    skillLevel,
    role: "player",
    createdAt: now,
    updatedAt: now,
  });

  return credential.user;
}

export async function loginWithEmail(
  email: string,
  password: string
) {
  const credential =
    await signInWithEmailAndPassword(
      auth,
      email.trim().toLowerCase(),
      password
    );

  return credential.user;
}

export async function logoutPlayer() {
  await signOut(auth);
}

