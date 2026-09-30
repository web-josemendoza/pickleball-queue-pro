import { useEffect, useState } from "react";

import { subscribeToAuth } from "../lib/auth";
import {
  getPlayerProfile,
  type PlayerProfile,
} from "../lib/player";

type CurrentProfile = {
  ready: boolean;
  userId: string | null;
  profile: PlayerProfile | null;
};

// Who is signed in on this device, with their profile.
export function useCurrentProfile(): CurrentProfile & {
  refresh: (userId: string) => Promise<void>;
} {
  const [state, setState] = useState<CurrentProfile>({
    ready: false,
    userId: null,
    profile: null,
  });

  const load = async (userId: string) => {
    let profile: PlayerProfile | null = null;

    try {
      profile = await getPlayerProfile(userId);
    } catch (error) {
      console.error("Unable to load player profile:", error);
    }

    setState({ ready: true, userId, profile });
  };

  useEffect(
    () =>
      subscribeToAuth((user) => {
        if (!user) {
          setState({ ready: true, userId: null, profile: null });
          return;
        }

        void load(user.uid);
      }),
    []
  );

  return { ...state, refresh: load };
}
