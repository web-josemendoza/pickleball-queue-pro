import {
  get,
  ref,
  set,
  update,
} from "firebase/database";

import { db } from "./firebase";

export type SkillLevel =
  | 2.0
  | 2.25
  | 2.5
  | 2.75
  | 3.0
  | 3.25
  | 3.5
  | 3.75
  | 4.0
  | 4.25
  | 4.5
  | 4.75
  | 5.0
  | "5.0+";

export const SKILL_LEVELS: SkillLevel[] = [
  2.0,
  2.25,
  2.5,
  2.75,
  3.0,
  3.25,
  3.5,
  3.75,
  4.0,
  4.25,
  4.5,
  4.75,
  5.0,
  "5.0+",
];

export function formatSkillLevel(
  skillLevel: SkillLevel
): string {
  if (skillLevel === "5.0+") {
    return "5.0+";
  }

  return skillLevel.toFixed(2).replace(/0$/, "");
}

export interface PlayerProfile {
  playerId: string;
  name: string;
  email?: string;
  phone?: string;
  skillLevel: SkillLevel;
  role: "player" | "admin";
  createdAt: number;
  updatedAt: number;
}

const playersRef = ref(db, "players");

export async function createPlayerProfile(
  profile: PlayerProfile
) {
  await set(
    ref(db, `players/${profile.playerId}`),
    profile
  );

  return profile;
}

export async function getPlayerProfile(
  playerId: string
): Promise<PlayerProfile | null> {
  const snapshot = await get(
    ref(db, `players/${playerId}`)
  );

  if (!snapshot.exists()) {
    return null;
  }

  return snapshot.val() as PlayerProfile;
}

export async function updatePlayerProfile(
  playerId: string,
  updates: Partial<
    Pick<
      PlayerProfile,
      "name" | "email" | "phone" | "skillLevel"
    >
  >
) {
  await update(
    ref(db, `players/${playerId}`),
    {
      ...updates,
      updatedAt: Date.now(),
    }
  );
}

export async function getAllPlayerProfiles(): Promise<
  PlayerProfile[]
> {
  const snapshot = await get(playersRef);

  if (!snapshot.exists()) {
    return [];
  }

  const data = snapshot.val();

  return Object.entries(data).map(
    ([playerId, value]) => ({
      ...(value as Omit<
        PlayerProfile,
        "playerId"
      >),
      playerId,
    })
  );
}