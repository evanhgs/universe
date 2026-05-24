"use client";

import { useAuth } from "@clerk/nextjs";
import { useState } from "react";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type ApiState = {
  status: number | null;
  body: JsonValue | null;
};

type SaturationSample = {
  id: number;
  status: number | null;
  retryAfter: string | null;
  durationMs: number;
  body: JsonValue | null;
  error?: string;
};

type SaturationRun = {
  total: number;
  completed: number;
  durationMs: number;
  ok: number;
  limited: number;
  unavailable: number;
  unauthorized: number;
  failed: number;
  samples: SaturationSample[];
};

const initialState: ApiState = {
  status: null,
  body: null,
};

const sectionClass =
  "rounded-2xl border border-black/10 bg-white p-5 shadow-[0_12px_32px_rgba(15,23,42,0.08)]";
const buttonClass =
  "rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700";
const secondaryButtonClass =
  "rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50";
const inputClass =
  "w-full rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 outline-none transition focus:border-amber-400";
const textareaClass =
  "mt-3 block w-full rounded-2xl border border-slate-200 bg-slate-950 p-4 text-sm leading-6 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-amber-400";
const preClass =
  "mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-950 p-4 text-sm leading-6 text-slate-100";

/**
 * Appelle une route API locale avec headers JSON par defaut.
 * @param path Chemin API relatif.
 * @param init Options fetch optionnelles.
 */
async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();

  return {
    status: response.status,
    body: text ? (JSON.parse(text) as JsonValue) : null,
  };
}

/**
 * Page outil pour tester les endpoints account depuis le navigateur.
 * @returns Interface de diagnostic Clerk/account.
 */
export default function AccountTestPage() {
  const { getToken, isLoaded, userId } = useAuth();
  const [me, setMe] = useState<ApiState>(initialState);
  const [profile, setProfile] = useState<ApiState>(initialState);
  const [roles, setRoles] = useState<ApiState>(initialState);
  const [emailTest, setEmailTest] = useState<ApiState>(initialState);
  const [emailConfig, setEmailConfig] = useState<ApiState>(initialState);
  const [sessionToken, setSessionToken] = useState<string>("");
  const [profilePayload, setProfilePayload] = useState(
    JSON.stringify(
      {
        displayName: "Seed Seller Updated",
        bio: "Test profile update from /account-test.",
        city: "Paris",
        countryCode: "FR",
        isPublic: true,
      },
      null,
      2,
    ),
  );
  const [rolesPayload, setRolesPayload] = useState(
    JSON.stringify(
      {
        roles: ["BUYER", "SELLER"],
      },
      null,
      2,
    ),
  );
  const [emailPayload, setEmailPayload] = useState(
    JSON.stringify(
      {
        toEmail: "replace-me@example.com",
        recipientName: "Universe Tester",
        template: "PURCHASE_CONFIRMED",
      },
      null,
      2,
    ),
  );
  const [saturationTotal, setSaturationTotal] = useState(32);
  const [saturationConcurrency, setSaturationConcurrency] = useState(8);
  const [saturationRun, setSaturationRun] = useState<SaturationRun | null>(null);
  const [isSaturating, setIsSaturating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenStatus, setTokenStatus] = useState<string | null>(null);

  /**
   * Execute une action async de test et capture son erreur.
   * @param action Operation API a lancer.
   */
  async function run(action: () => Promise<void>) {
    setError(null);

    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }

  /**
   * Charge le session token Clerk courant pour tests API externes.
   */
  async function loadSessionToken() {
    setTokenStatus(null);
    setError(null);

    try {
      const token = await getToken();

      if (!token) {
        setSessionToken("");
        setTokenStatus("Aucun token disponible. Connecte-toi d'abord avec Clerk.");
        return;
      }

      setSessionToken(token);
      setTokenStatus("Session token charge. Tu peux le copier dans Bruno.");
    } catch (err) {
      setSessionToken("");
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }

  /**
   * Copie le token Clerk charge dans le presse-papiers.
   */
  async function copySessionToken() {
    if (!sessionToken) {
      setTokenStatus("Charge d'abord un session token.");
      return;
    }

    await navigator.clipboard.writeText(sessionToken);
    setTokenStatus("Session token copie dans le presse-papiers.");
  }

  function summarizeSaturation(samples: SaturationSample[], total: number, startedAt: number): SaturationRun {
    return {
      total,
      completed: samples.length,
      durationMs: Math.round(performance.now() - startedAt),
      ok: samples.filter((sample) => sample.status !== null && sample.status >= 200 && sample.status < 300).length,
      limited: samples.filter((sample) => sample.status === 429).length,
      unavailable: samples.filter((sample) => sample.status === 503).length,
      unauthorized: samples.filter((sample) => sample.status === 401).length,
      failed: samples.filter((sample) => sample.status === null).length,
      samples: [...samples].sort((a, b) => a.id - b.id).slice(-12),
    };
  }

  async function requestRateLimitProbe(id: number): Promise<SaturationSample> {
    const startedAt = performance.now();

    try {
      const response = await fetch("/api/account-test/rate-limit", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          id,
          nonce: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${id}`,
        }),
      });
      const text = await response.text();
      const body = text ? (JSON.parse(text) as JsonValue) : null;

      return {
        id,
        status: response.status,
        retryAfter: response.headers.get("Retry-After"),
        durationMs: Math.round(performance.now() - startedAt),
        body,
      };
    } catch (err) {
      return {
        id,
        status: null,
        retryAfter: null,
        durationMs: Math.round(performance.now() - startedAt),
        body: null,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  async function runSaturation() {
    setError(null);
    setIsSaturating(true);

    const total = Math.min(400, Math.max(1, Math.trunc(saturationTotal)));
    const concurrency = Math.min(50, total, Math.max(1, Math.trunc(saturationConcurrency)));
    const startedAt = performance.now();
    const samples: SaturationSample[] = [];
    let nextId = 1;

    setSaturationRun(summarizeSaturation(samples, total, startedAt));

    async function worker() {
      while (nextId <= total) {
        const id = nextId;
        nextId += 1;
        const sample = await requestRateLimitProbe(id);

        samples.push(sample);
        setSaturationRun(summarizeSaturation(samples, total, startedAt));
      }
    }

    try {
      await Promise.all(Array.from({ length: Math.min(concurrency, total) }, () => worker()));
    } finally {
      setSaturationRun(summarizeSaturation(samples, total, startedAt));
      setIsSaturating(false);
    }
  }

  /**
   * Affiche un badge de statut HTTP pour un appel de test.
   * @param status Code HTTP retourne ou null si non appele.
   */
  function renderStatus(status: number | null) {
    if (status === null) {
      return (
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
          not called
        </span>
      );
    }

    const tone =
      status >= 200 && status < 300
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-rose-200 bg-rose-50 text-rose-700";

    return <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>{status}</span>;
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#fff9ed_100%)] px-4 py-10 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.10)]">
          <div className="bg-[radial-gradient(circle_at_top_left,#f59e0b_0%,transparent_35%),linear-gradient(135deg,#0f172a_0%,#1e293b_100%)] px-6 py-8 text-white sm:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">Debug Surface</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Account API test</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200">
              Routes testees: <code>/api/account/me</code>, <code>/api/account/me/profile</code>,{" "}
              <code>/api/account/me/roles</code>. Connecte-toi avec Clerk dans le navigateur puis reutilise un
              vrai session token dans Bruno.
            </p>
          </div>
          <div className="grid gap-4 border-t border-slate-200 bg-white px-6 py-5 text-sm sm:grid-cols-3 sm:px-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Workflow Bruno</p>
              <p className="mt-2 leading-6 text-slate-700">
                Charge un token Clerk ici, colle-le dans <code>clerkSessionToken</code>, puis appelle les routes{" "}
                <code>/api/account/...</code>.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Etat Clerk</p>
              <p className="mt-2 leading-6 text-slate-700">
                {isLoaded ? (userId ? `connecte (${userId})` : "non connecte") : "chargement"}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Acces</p>
              <p className="mt-2 leading-6 text-slate-700">Ces routes doivent repondre en 200 seulement si la session est valide.</p>
            </div>
          </div>
        </section>

        {error ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error}
          </p>
        ) : null}

        <section className={sectionClass}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Bruno session token</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Charge un vrai token de session depuis Clerk puis copie-le dans Bruno pour tester les endpoints locaux.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className={buttonClass} onClick={() => void loadSessionToken()} type="button">
                Load session token
              </button>
              <button className={secondaryButtonClass} onClick={() => void copySessionToken()} type="button">
                Copy session token
              </button>
            </div>
          </div>
          <p className="mt-4 text-sm text-slate-600">
            {tokenStatus ?? "Charge un token si tu veux tester Bruno avec Authorization: Bearer."}
          </p>
          <textarea className={textareaClass} readOnly rows={8} value={sessionToken} />
        </section>

        <section className={sectionClass}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Rate limit saturation</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Lance un burst sur <code>/api/account-test/rate-limit</code>. La policy de test est{" "}
                <code>8 requetes / 10 s</code>, donc un burst au-dessus doit produire des <code>429</code> avec{" "}
                <code>Retry-After</code>.
              </p>
            </div>
            <button
              className={isSaturating ? `${secondaryButtonClass} cursor-wait opacity-70` : buttonClass}
              disabled={isSaturating}
              onClick={() => void runSaturation()}
              type="button"
            >
              {isSaturating ? "Burst running" : "Run burst"}
            </button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm font-medium text-slate-700">
              Total requests
              <input
                className={`mt-2 ${inputClass}`}
                max={400}
                min={1}
                onChange={(event) => setSaturationTotal(Number(event.target.value))}
                type="number"
                value={saturationTotal}
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Concurrency
              <input
                className={`mt-2 ${inputClass}`}
                max={50}
                min={1}
                onChange={(event) => setSaturationConcurrency(Number(event.target.value))}
                type="number"
                value={saturationConcurrency}
              />
            </label>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Progress</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {saturationRun ? `${saturationRun.completed}/${saturationRun.total}` : "0/0"}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Duration</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {saturationRun ? `${saturationRun.durationMs} ms` : "-"}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">2xx</p>
              <p className="mt-2 text-2xl font-semibold text-emerald-900">{saturationRun?.ok ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">429</p>
              <p className="mt-2 text-2xl font-semibold text-amber-900">{saturationRun?.limited ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-700">503</p>
              <p className="mt-2 text-2xl font-semibold text-rose-900">{saturationRun?.unavailable ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">401</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{saturationRun?.unauthorized ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Network</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{saturationRun?.failed ?? 0}</p>
            </div>
          </div>

          <pre className={preClass}>{JSON.stringify(saturationRun?.samples ?? [], null, 2)}</pre>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className={sectionClass}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">GET /api/account/me</h2>
              {renderStatus(me.status)}
            </div>
            <p className="mt-2 text-sm text-slate-600">Recupere le snapshot du compte courant.</p>
            <button
              className={`mt-4 ${buttonClass}`}
              onClick={() =>
                run(async () => {
                  setMe(await request("/api/account/me"));
                })
              }
              type="button"
            >
              Load me
            </button>
            <pre className={preClass}>{JSON.stringify(me.body, null, 2)}</pre>
          </section>

          <section className={sectionClass}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">GET /api/account/me/profile</h2>
              {renderStatus(profile.status)}
            </div>
            <p className="mt-2 text-sm text-slate-600">Charge le profil public/prive du compte courant.</p>
            <button
              className={`mt-4 ${buttonClass}`}
              onClick={() =>
                run(async () => {
                  setProfile(await request("/api/account/me/profile"));
                })
              }
              type="button"
            >
              Load profile
            </button>
            <pre className={preClass}>{JSON.stringify(profile.body, null, 2)}</pre>
          </section>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className={sectionClass}>
            <h2 className="text-lg font-semibold">PATCH /api/account/me/profile</h2>
            <p className="mt-2 text-sm text-slate-600">Edite le payload puis envoie la mise a jour du profil.</p>
            <textarea
              className={textareaClass}
              onChange={(event) => setProfilePayload(event.target.value)}
              rows={12}
              value={profilePayload}
            />
            <button
              className={`mt-4 ${buttonClass}`}
              onClick={() =>
                run(async () => {
                  setProfile(
                    await request("/api/account/me/profile", {
                      method: "PATCH",
                      body: profilePayload,
                    }),
                  );
                })
              }
              type="button"
            >
              Update profile
            </button>
          </section>

          <section className={sectionClass}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">GET /api/account/me/roles</h2>
              {renderStatus(roles.status)}
            </div>
            <p className="mt-2 text-sm text-slate-600">Liste les roles actuellement attaches au compte.</p>
            <button
              className={`mt-4 ${buttonClass}`}
              onClick={() =>
                run(async () => {
                  setRoles(await request("/api/account/me/roles"));
                })
              }
              type="button"
            >
              Load roles
            </button>
            <pre className={preClass}>{JSON.stringify(roles.body, null, 2)}</pre>
          </section>
        </div>

        <section className={sectionClass}>
          <h2 className="text-lg font-semibold">PUT /api/account/me/roles</h2>
          <p className="mt-2 text-sm text-slate-600">Teste la mise a jour self-service des roles avec un payload JSON.</p>
          <textarea
            className={textareaClass}
            onChange={(event) => setRolesPayload(event.target.value)}
            rows={8}
            value={rolesPayload}
          />
          <button
            className={`mt-4 ${buttonClass}`}
            onClick={() =>
              run(async () => {
                setRoles(
                  await request("/api/account/me/roles", {
                    method: "PUT",
                    body: rolesPayload,
                  }),
                );
              })
            }
            type="button"
          >
            Update roles
          </button>
        </section>

        <section className={sectionClass}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">POST /api/account-test/email</h2>
              <p className="mt-2 text-sm text-slate-600">
                Envoie un email Postmark reel avec un template transactionnel de test. Templates disponibles:{" "}
                <code>PURCHASE_CONFIRMED</code>, <code>SALE_CONFIRMED</code>,{" "}
                <code>SELLER_ACCESS_GRANTED</code>, <code>CHAT_UNREAD_REMINDER</code>.
              </p>
            </div>
            {renderStatus(emailTest.status)}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              className={secondaryButtonClass}
              onClick={() =>
                run(async () => {
                  setEmailConfig(await request("/api/account-test/email"));
                })
              }
              type="button"
            >
              Load email config
            </button>
            {renderStatus(emailConfig.status)}
          </div>
          <pre className={preClass}>{JSON.stringify(emailConfig.body, null, 2)}</pre>
          <textarea
            className={textareaClass}
            onChange={(event) => setEmailPayload(event.target.value)}
            rows={8}
            value={emailPayload}
          />
          <button
            className={`mt-4 ${buttonClass}`}
            onClick={() =>
              run(async () => {
                setEmailTest(
                  await request("/api/account-test/email", {
                    method: "POST",
                    body: emailPayload,
                  }),
                );
              })
            }
            type="button"
          >
            Send test email
          </button>
          <pre className={preClass}>{JSON.stringify(emailTest.body, null, 2)}</pre>
        </section>
      </div>
    </main>
  );
}
