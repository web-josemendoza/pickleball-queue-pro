/*
 * Security rules tests. They need the database
 * emulator, so run them with `npm run test:rules`.
 */

import { readFileSync } from "node:fs";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  get,
  ref,
  remove,
  set,
  update,
} from "firebase/database";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  it,
} from "vitest";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "pickleball-queue-pro",
    database: {
      host: "127.0.0.1",
      port: 9000,
      rules: readFileSync(
        "database.rules.json",
        "utf8"
      ),
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearDatabase();

  await env.withSecurityRulesDisabled(
    async (context) => {
      await set(ref(context.database()), {
        players: {
          admin1: { name: "Admin", role: "admin" },
          p1: { name: "Pat", role: "player" },
          p2: { name: "Sam", role: "player" },
        },
        queue: {
          p2: { name: "Sam", joinedAt: 1 },
        },
        openPlay: {
          game: { status: "active", cycleNumber: 1 },
          sessionHistory: {
            s1: { sessionId: "s1" },
          },
        },
      });
    }
  );
});

const anon = () =>
  env.unauthenticatedContext().database();
const player = () =>
  env.authenticatedContext("p1").database();
const admin = () =>
  env.authenticatedContext("admin1").database();

describe("spectators (not signed in)", () => {
  it("can read the queue and the session", async () => {
    await assertSucceeds(get(ref(anon(), "queue")));
    await assertSucceeds(
      get(ref(anon(), "openPlay/game"))
    );
  });

  it("cannot read player profiles", async () => {
    await assertFails(get(ref(anon(), "players")));
  });

  it("cannot change the session or queue", async () => {
    await assertFails(
      set(ref(anon(), "openPlay/game/status"), "finished")
    );
    await assertFails(
      set(ref(anon(), "queue/x"), { name: "X" })
    );
  });
});

describe("players", () => {
  it("can join and leave the queue themselves", async () => {
    await assertSucceeds(
      set(ref(player(), "queue/p1"), {
        name: "Pat",
        joinedAt: 2,
      })
    );
    await assertSucceeds(
      remove(ref(player(), "queue/p1"))
    );
  });

  it("cannot add or remove other players in the queue", async () => {
    await assertFails(
      remove(ref(player(), "queue/p2"))
    );
    await assertFails(
      set(ref(player(), "queue"), {})
    );
  });

  it("can report scores by updating the session", async () => {
    await assertSucceeds(
      update(ref(player(), "openPlay/game"), {
        cycleNumber: 2,
      })
    );
  });

  it("cannot delete the session", async () => {
    await assertFails(
      remove(ref(player(), "openPlay/game"))
    );
  });

  it("cannot touch session history or pending pairs", async () => {
    await assertFails(
      remove(ref(player(), "openPlay/sessionHistory/s1"))
    );
    await assertFails(
      set(ref(player(), "openPlay/pendingPairRules"), {
        fixedPairs: [],
      })
    );
  });

  it("can edit their own profile but not make themselves admin", async () => {
    await assertSucceeds(
      update(ref(player(), "players/p1"), {
        name: "Patricia",
      })
    );
    await assertFails(
      set(ref(player(), "players/p1/role"), "admin")
    );
    await assertFails(
      update(ref(player(), "players/p1"), {
        role: "admin",
      })
    );
  });

  it("cannot edit someone else's profile", async () => {
    await assertFails(
      update(ref(player(), "players/p2"), {
        name: "Hacked",
      })
    );
  });

  it("can create a new account only as a player", async () => {
    const newcomer = env
      .authenticatedContext("p3")
      .database();

    await assertFails(
      set(ref(newcomer, "players/p3"), {
        name: "New",
        role: "admin",
      })
    );
    await assertSucceeds(
      set(ref(newcomer, "players/p3"), {
        name: "New",
        role: "player",
      })
    );
  });
});

describe("tournament", () => {
  const tournament = { id: "t", name: "Club Open", status: "setup" };

  it("anyone can watch it", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await set(ref(context.database(), "tournament/current"), tournament);
    });

    await assertSucceeds(get(ref(anon(), "tournament/current")));
  });

  it("only admins can create or delete it", async () => {
    await assertFails(set(ref(player(), "tournament/current"), tournament));
    await assertSucceeds(set(ref(admin(), "tournament/current"), tournament));
    await assertFails(remove(ref(player(), "tournament/current")));
    await assertSucceeds(remove(ref(admin(), "tournament/current")));
  });

  it("signed-in players can update a running one (report scores)", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await set(ref(context.database(), "tournament/current"), tournament);
    });

    await assertSucceeds(
      update(ref(player(), "tournament/current"), { status: "pools" })
    );
    await assertFails(
      update(ref(anon(), "tournament/current"), { status: "pools" })
    );
  });
});

describe("tournament history", () => {
  const finished = { id: "t1", name: "Club Open", status: "finished" };

  async function setCurrent(value: object) {
    await env.withSecurityRulesDisabled(async (context) => {
      await set(ref(context.database(), "tournament/current"), value);
    });
  }

  it("anyone can read it", async () => {
    await assertSucceeds(get(ref(anon(), "tournament/history")));
  });

  it("a player can save the finished current tournament", async () => {
    await setCurrent(finished);
    await assertSucceeds(
      set(ref(player(), "tournament/history/t1"), { ...finished, archivedAt: 1 })
    );
  });

  it("a player can't save one still in progress, or a made-up one", async () => {
    await setCurrent({ ...finished, status: "playoffs" });
    await assertFails(
      set(ref(player(), "tournament/history/t1"), { ...finished, archivedAt: 1 })
    );

    await setCurrent(finished);
    await assertFails(
      set(ref(player(), "tournament/history/fake"), { ...finished, id: "fake" })
    );
    await assertFails(
      set(ref(anon(), "tournament/history/t1"), { ...finished, archivedAt: 1 })
    );
  });

  it("only admins can delete history", async () => {
    await setCurrent(finished);
    await env.withSecurityRulesDisabled(async (context) => {
      await set(ref(context.database(), "tournament/history/t1"), finished);
    });

    await assertFails(remove(ref(player(), "tournament/history/t1")));
    await assertSucceeds(remove(ref(admin(), "tournament/history/t1")));
  });
});

describe("push tokens", () => {
  const token = { token: "device-token", createdAt: 1 };

  it("lets players save and remove their own devices", async () => {
    await assertSucceeds(
      set(ref(player(), "pushTokens/p1/device1"), token)
    );
    await assertSucceeds(
      get(ref(player(), "pushTokens/p1"))
    );
    await assertSucceeds(
      remove(ref(player(), "pushTokens/p1/device1"))
    );
  });

  it("keeps other players' devices private", async () => {
    await assertFails(
      set(ref(player(), "pushTokens/p2/device1"), token)
    );
    await assertFails(get(ref(player(), "pushTokens/p2")));
    await assertFails(get(ref(admin(), "pushTokens/p1")));
    await assertFails(get(ref(anon(), "pushTokens")));
  });

  it("rejects malformed entries", async () => {
    await assertFails(
      set(ref(player(), "pushTokens/p1/device1"), {
        token: 42,
        createdAt: 1,
      })
    );
    await assertFails(
      set(ref(player(), "pushTokens/p1/device1"), {
        token: "no-date",
      })
    );
  });
});

describe("admins", () => {
  it("can manage the queue", async () => {
    await assertSucceeds(
      remove(ref(admin(), "queue/p2"))
    );
    await assertSucceeds(
      set(ref(admin(), "queue"), {
        p1: { name: "Pat", joinedAt: 1 },
      })
    );
  });

  it("can clear players with a multi-path update", async () => {
    await assertSucceeds(
      update(ref(admin()), { "queue/p2": null })
    );
  });

  it("can delete the session and history", async () => {
    await assertSucceeds(
      remove(ref(admin(), "openPlay/game"))
    );
    await assertSucceeds(
      remove(ref(admin(), "openPlay/sessionHistory/s1"))
    );
  });

  it("can set pending pairs", async () => {
    await assertSucceeds(
      set(ref(admin(), "openPlay/pendingPairRules"), {
        fixedPairs: [{ playerA: "p1", playerB: "p2" }],
      })
    );
  });

  it("can promote another player", async () => {
    await assertSucceeds(
      set(ref(admin(), "players/p2/role"), "admin")
    );
  });
});
