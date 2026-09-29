import {
  useState,
} from "react";

import {
  loginWithEmail,
  registerWithEmail,
} from "../lib/playerAuth";

import {
  SKILL_LEVELS,
  formatSkillLevel,
  type SkillLevel,
} from "../lib/player";

export default function PlayerAuth({
  onAuthenticated,
}: {
  onAuthenticated?: (
    userId: string
  ) => void | Promise<void>;
}) {
  const [mode, setMode] =
    useState<"login" | "register">(
      "register"
    );

  const [name, setName] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [phone, setPhone] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [skillLevel, setSkillLevel] =
    useState<SkillLevel>(2.0);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  async function handleSubmit(
    event: React.FormEvent
  ) {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      let user;

      if (mode === "register") {
        user =
          await registerWithEmail(
            name,
            email,
            phone,
            password,
            skillLevel
          );
      } else {
        user =
          await loginWithEmail(
            email,
            password
          );
      }

      await onAuthenticated?.(
        user.uid
      );
    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to authenticate."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full">
      <div className="w-full rounded-2xl bg-white">

        <div className="mb-7">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-500">
            Pickleball Queue Pro
          </p>

          <h1 className="mt-2 text-3xl font-black text-slate-950">
            {mode === "register"
              ? "Create Player Account"
              : "Welcome Back"}
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            {mode === "register"
              ? "Create your player profile before joining open play."
              : "Sign in to join the queue."}
          </p>
        </div>

        {error && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          {mode === "register" && (
            <>
              <div>
                <label className="text-sm font-bold text-slate-700">
                  Full Name
                </label>

                <input
                  value={name}
                  onChange={(event) =>
                    setName(
                      event.target.value
                    )
                  }
                  placeholder="John Mendoza"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-cyan-500"
                  required
                  disabled={loading}
                />
              </div>

              <div>
                <label className="text-sm font-bold text-slate-700">
                  Phone Number
                </label>

                <input
                  type="tel"
                  value={phone}
                  onChange={(event) =>
                    setPhone(
                      event.target.value
                    )
                  }
                  placeholder="09XXXXXXXXX"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-cyan-500"
                  required
                  disabled={loading}
                />
              </div>

              <div>
                <label className="text-sm font-bold text-slate-700">
                  Skill Level
                </label>

                <select
                  value={String(
                    skillLevel
                  )}
                  onChange={(event) => {
                    const value =
                      event.target.value;

                    setSkillLevel(
                      value === "5.0+"
                        ? "5.0+"
                        : (Number(
                            value
                          ) as SkillLevel)
                    );
                  }}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-cyan-500"
                  disabled={loading}
                >
                  {SKILL_LEVELS.map(
                    (level) => (
                      <option
                        key={String(
                          level
                        )}
                        value={String(
                          level
                        )}
                      >
                        {formatSkillLevel(
                          level
                        )}
                      </option>
                    )
                  )}
                </select>
              </div>
            </>
          )}

          <div>
            <label className="text-sm font-bold text-slate-700">
              Email
            </label>

            <input
              type="email"
              value={email}
              onChange={(event) =>
                setEmail(
                  event.target.value
                )
              }
              placeholder="you@email.com"
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-cyan-500"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="text-sm font-bold text-slate-700">
              Password
            </label>

            <input
              type="password"
              value={password}
              onChange={(event) =>
                setPassword(
                  event.target.value
                )
              }
              placeholder="Minimum 6 characters"
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-cyan-500"
              required
              minLength={6}
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-green-600 px-5 py-4 font-black text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {loading
              ? "PLEASE WAIT..."
              : mode ===
                  "register"
                ? "CREATE ACCOUNT"
                : "LOGIN"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setMode(
                mode ===
                  "register"
                  ? "login"
                  : "register"
              );

              setError("");
            }}
            className="text-sm font-bold text-cyan-600 hover:text-cyan-700 disabled:opacity-50"
          >
            {mode === "register"
              ? "Already have an account? Login"
              : "Need an account? Register"}
          </button>
        </div>

      </div>
    </div>
  );
}