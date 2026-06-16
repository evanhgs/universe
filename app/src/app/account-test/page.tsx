"use client";

import { Alert, type AlertProps } from "@/components/ui/alert";
import { notify } from "@/components/ui/notification";
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

type BreakdownItem = {
  type?: string;
  source?: string;
  count: number;
};

type ScoreBreakdown = {
  engagement: number;
  keyword: number;
  similarity: number;
  sales: number;
  freshness: number;
  seller: number;
  diversity: number;
};

type TopRecommendation = {
  beatId: string;
  title: string;
  slug: string;
  seller: string;
  genre: string | null;
  mood: string | null;
  bpm: number | null;
  reason: string | null;
  organicScore: number;
  computedAt: string;
  scores: ScoreBreakdown;
  stats: {
    impressions: number;
    plays: number;
    fullPlays: number;
    skips: number;
    likes: number;
    licenseClicks: number;
    addToCart: number;
    purchases: number;
    conversionRate: number;
  } | null;
};

type TopStats = {
  beatId: string;
  title: string;
  slug: string;
  seller: string;
  genre: string | null;
  impressions: number;
  plays: number;
  fullPlays: number;
  skips: number;
  likes: number;
  licenseClicks: number;
  addToCart: number;
  purchases: number;
  revenue: number;
  conversionRate: number;
  updatedAt: string;
};

type TasteEntry = {
  label: string;
  score: number;
};

type TasteProfile = {
  userId: string;
  displayName: string;
  slug: string | null;
  eventCount: number;
  favoriteGenres: TasteEntry[];
  favoriteMoods: TasteEntry[];
  favoriteTags: TasteEntry[];
  preferredBpmRange: [number, number] | null;
  updatedAt: string;
};

type LatestAnalyticsEvent = {
  id: string;
  type: string;
  source: string | null;
  beatTitle: string | null;
  beatSlug: string | null;
  user: string | null;
  occurredAt: string;
};

type AnalyticsSnapshot = {
  generatedAt: string;
  queryDurationMs: number;
  scoreVersion: string;
  health: {
    score: number;
    status: "ready" | "warming_up" | "needs_data";
    statsCoverage: number;
    scoreCoverage: number;
    latestScoreComputedAt: string | null;
    latestScoreAgeMs: number | null;
  };
  counts: {
    users: number;
    sellers: number;
    publishedBeats: number;
    analyticsEvents: number;
    analyticsEvents24h: number;
    analyticsEvents7d: number;
    beatStats: number;
    recommendationScores: number;
    tasteProfiles: number;
    sellerStats: number;
  };
  algorithm: {
    eventWeights: Record<string, number>;
    organicWeights: Record<string, number>;
    feedMix: Record<string, number>;
  };
  eventBreakdown: BreakdownItem[];
  sourceBreakdown: BreakdownItem[];
  topRecommendations: TopRecommendation[];
  topStats: TopStats[];
  tasteProfiles: TasteProfile[];
  latestEvents: LatestAnalyticsEvent[];
};

type AnalyticsRecomputeResult = {
  ok: boolean;
  recomputedScores: number;
  durationMs: number;
  snapshot: AnalyticsSnapshot;
};

const initialState: ApiState = {
  status: null,
  body: null,
};

const sectionClass =
  "rounded-lg border border-border bg-card p-5 text-card-foreground shadow-sm";
const buttonClass =
  "rounded-full border border-primary bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90";
const secondaryButtonClass =
  "rounded-full border border-input bg-card px-4 py-2 text-sm font-medium text-foreground transition hover:border-ring hover:bg-muted";
const inputClass =
  "w-full rounded-full border border-input bg-background px-4 py-2 text-sm font-medium text-foreground outline-none transition focus:border-ring";
const textareaClass =
  "mt-3 block w-full rounded-lg border border-input bg-background p-4 text-sm leading-6 text-foreground outline-none transition placeholder:text-muted-foreground focus:border-ring";
const preClass =
  "mt-3 overflow-x-auto rounded-lg border border-border bg-muted p-4 text-sm leading-6 text-foreground";
const miniCardClass = "rounded-lg border border-border bg-muted px-4 py-3";

const alertDemoClass =
  "static left-auto top-auto z-auto w-full max-w-none translate-x-0 motion-safe:animate-none";

const alertDemos = [
  {
    durationMs: 3200,
    id: "alert-demo-default",
    label: "Default",
    message: "Notification neutre avec props HTML, className et contenu enfant.",
    variant: "default",
  },
  {
    durationMs: 3600,
    id: "alert-demo-success",
    label: "Success",
    message: "Ton abonnement Universe a bien ete pris en compte.",
    variant: "success",
  },
  {
    durationMs: 4200,
    id: "alert-demo-warning",
    label: "Warning",
    message: "Le paiement a ete annule. Aucun changement n'a ete applique.",
    variant: "warning",
  },
  {
    durationMs: 5000,
    id: "alert-demo-destructive",
    label: "Destructive",
    message: "Une erreur est survenue pendant l'appel API de test.",
    variant: "destructive",
  },
  {
    durationMs: 6500,
    id: "alert-demo-muted",
    label: "Muted",
    message: "Etat informatif discret pour les retours secondaires.",
    variant: "muted",
  },
] satisfies Array<{
  durationMs: number;
  id: string;
  label: string;
  message: string;
  variant: NonNullable<AlertProps["variant"]>;
}>;

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

function formatPercent(value: number) {
  return `${Math.round(value * 10) / 10}%`;
}

function formatScore(value: number) {
  return Math.round(value * 1000) / 1000;
}

function formatAge(milliseconds: number | null) {
  if (milliseconds === null) {
    return "jamais";
  }

  const minutes = Math.floor(milliseconds / 60000);

  if (minutes < 1) return "maintenant";
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);

  if (hours < 24) return `${hours} h`;

  return `${Math.floor(hours / 24)} j`;
}

function scoreTone(score: number) {
  if (score >= 80) {
    return "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/70 dark:bg-emerald-950/60 dark:text-emerald-300";
  }

  if (score >= 45) {
    return "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/60 dark:text-amber-300";
  }

  return "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/70 dark:bg-rose-950/60 dark:text-rose-300";
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
        <span>{label}</span>
        <span>{formatScore(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
        />
      </div>
    </div>
  );
}

function BreakdownBars({
  items,
  labelKey,
}: {
  items: BreakdownItem[];
  labelKey: "type" | "source";
}) {
  const max = Math.max(...items.map((item) => item.count), 1);

  return (
    <div className="grid gap-2">
      {items.slice(0, 8).map((item) => {
        const label = item[labelKey] ?? "unknown";

        return (
          <div key={label}>
            <div className="mb-1 flex items-center justify-between gap-3 text-xs font-medium text-muted-foreground">
              <span className="truncate">{label}</span>
              <span>{item.count}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${Math.max(4, (item.count / max) * 100)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NotificationShowcase() {
  return (
    <section className={sectionClass}>
      <div>
        <h2 className="text-lg font-semibold">Notification showcase</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Test visuel de <code>Alert</code> et declenchement imperatif via <code>notify(...)</code>,
          utilisable depuis un fichier client non TSX.
        </p>
      </div>

      <div className="mt-5 grid gap-3">
        {alertDemos.map((demo) => (
          <Alert
            aria-live={demo.variant === "destructive" ? "assertive" : "polite"}
            className={alertDemoClass}
            data-testid={`account-test-${demo.id}`}
            id={demo.id}
            key={demo.id}
            role={demo.variant === "destructive" ? "alert" : "status"}
            title={`${demo.label} Alert`}
            variant={demo.variant}
          >
            <span className="font-semibold">{demo.label}:</span> {demo.message}
          </Alert>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {alertDemos.map((demo) => (
          <button
            className={demo.variant === "default" ? secondaryButtonClass : buttonClass}
            key={`notify-${demo.id}`}
            onClick={() => {
              void notify({
                durationMs: demo.durationMs,
                message: demo.message,
                title: `${demo.label}:`,
                variant: demo.variant,
              });
            }}
            type="button"
          >
            Notify {demo.label}
          </button>
        ))}
      </div>
    </section>
  );
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
  const [sentryTest, setSentryTest] = useState<ApiState>(initialState);
  const [analyticsStatus, setAnalyticsStatus] = useState<number | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsSnapshot | null>(null);
  const [analyticsRaw, setAnalyticsRaw] = useState<JsonValue | null>(null);
  const [analyticsAction, setAnalyticsAction] = useState<string | null>(null);
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(false);
  const [isRecomputingAnalytics, setIsRecomputingAnalytics] = useState(false);
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
        notify({
          message: "Connecte-toi d'abord avec Clerk pour charger un token.",
          title: "Token indisponible:",
          variant: "warning",
        });
        return;
      }

      setSessionToken(token);
      setTokenStatus("Session token charge. Tu peux le copier dans Bruno.");
      notify({
        message: "Tu peux maintenant le copier dans Bruno.",
        title: "Session token charge:",
        variant: "success",
      });
    } catch (err) {
      setSessionToken("");
      const message = err instanceof Error ? err.message : "Unknown error";

      setError(message);
      notify({
        message,
        title: "Erreur Clerk:",
        variant: "destructive",
      });
    }
  }

  /**
   * Copie le token Clerk charge dans le presse-papiers.
   */
  async function copySessionToken() {
    if (!sessionToken) {
      setTokenStatus("Charge d'abord un session token.");
      notify({
        message: "Charge d'abord un session token.",
        title: "Copie impossible:",
        variant: "warning",
      });
      return;
    }

    await navigator.clipboard.writeText(sessionToken);
    setTokenStatus("Session token copie dans le presse-papiers.");
    notify({
      message: "Session token copie dans le presse-papiers.",
      title: "Copie terminee:",
      variant: "success",
    });
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

  async function loadAnalyticsBenchmark() {
    setError(null);
    setAnalyticsAction(null);
    setIsAnalyticsLoading(true);

    try {
      const response = await request("/api/account-test/analytics");

      setAnalyticsStatus(response.status);
      setAnalyticsRaw(response.body);
      setAnalytics(response.status >= 200 && response.status < 300 ? (response.body as AnalyticsSnapshot) : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsAnalyticsLoading(false);
    }
  }

  async function recomputeAnalyticsBenchmark() {
    setError(null);
    setAnalyticsAction(null);
    setIsRecomputingAnalytics(true);

    try {
      const response = await request("/api/account-test/analytics", {
        method: "POST",
        body: JSON.stringify({ action: "recompute" }),
      });
      const result = response.body as AnalyticsRecomputeResult | JsonValue;

      setAnalyticsStatus(response.status);
      setAnalyticsRaw(response.body);

      if (
        response.status >= 200 &&
        response.status < 300 &&
        result &&
        typeof result === "object" &&
        !Array.isArray(result) &&
        "snapshot" in result
      ) {
        const typedResult = result as AnalyticsRecomputeResult;

        setAnalytics(typedResult.snapshot);
        setAnalyticsAction(
          `${typedResult.recomputedScores} scores recalcules en ${typedResult.durationMs} ms.`,
        );
      } else {
        setAnalytics(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsRecomputingAnalytics(false);
    }
  }

  /**
   * Affiche un badge de statut HTTP pour un appel de test.
   * @param status Code HTTP retourne ou null si non appele.
   */
  function renderStatus(status: number | null) {
    if (status === null) {
      return (
        <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          not called
        </span>
      );
    }

    const tone =
      status >= 200 && status < 300
        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/60 dark:text-emerald-300"
        : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/60 dark:text-rose-300";

    return <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>{status}</span>;
  }

  return (
    <main className="mx-auto min-h-[calc(100vh-73px)] w-full max-w-6xl px-6 py-10 text-foreground">
      <div className="space-y-6">
        <section className="border-b border-border pb-8">
          <p className="text-sm font-medium uppercase text-muted-foreground">
            Debug surface
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground">
            Account API test
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground">
            Routes testees: <code>/api/account/me</code>, <code>/api/account/me/profile</code>,{" "}
            <code>/api/account/me/roles</code>. Connecte-toi avec Clerk dans le navigateur puis reutilise un
            vrai session token dans Bruno.
          </p>
          <div className="mt-6 grid gap-4 text-sm md:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Workflow Bruno</p>
              <p className="mt-2 leading-6 text-foreground">
                Charge un token Clerk ici, colle-le dans <code>clerkSessionToken</code>, puis appelle les routes{" "}
                <code>/api/account/...</code>.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Etat Clerk</p>
              <p className="mt-2 leading-6 text-foreground">
                {isLoaded ? (userId ? `connecte (${userId})` : "non connecte") : "chargement"}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Acces</p>
              <p className="mt-2 leading-6 text-foreground">Ces routes doivent repondre en 200 seulement si la session est valide.</p>
            </div>
          </div>
        </section>

        <NotificationShowcase />

        {error ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/60 dark:text-rose-300">
            {error}
          </p>
        ) : null}

        <section className={sectionClass}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Bruno session token</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
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
          <p className="mt-4 text-sm text-muted-foreground">
            {tokenStatus ?? "Charge un token si tu veux tester Bruno avec Authorization: Bearer."}
          </p>
          <textarea className={textareaClass} readOnly rows={8} value={sessionToken} />
        </section>

        <section className={sectionClass}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Rate limit saturation</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
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
            <label className="text-sm font-medium text-foreground">
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
            <label className="text-sm font-medium text-foreground">
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
            <div className="rounded-lg border border-border bg-muted px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Progress</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {saturationRun ? `${saturationRun.completed}/${saturationRun.total}` : "0/0"}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Duration</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {saturationRun ? `${saturationRun.durationMs} ms` : "-"}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900/70 dark:bg-emerald-950/60">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">2xx</p>
              <p className="mt-2 text-2xl font-semibold text-emerald-900 dark:text-emerald-200">{saturationRun?.ok ?? 0}</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/70 dark:bg-amber-950/60">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">429</p>
              <p className="mt-2 text-2xl font-semibold text-amber-900 dark:text-amber-200">{saturationRun?.limited ?? 0}</p>
            </div>
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 dark:border-rose-900/70 dark:bg-rose-950/60">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-700 dark:text-rose-300">503</p>
              <p className="mt-2 text-2xl font-semibold text-rose-900 dark:text-rose-200">{saturationRun?.unavailable ?? 0}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">401</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{saturationRun?.unauthorized ?? 0}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Network</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{saturationRun?.failed ?? 0}</p>
            </div>
          </div>

          <pre className={preClass}>{JSON.stringify(saturationRun?.samples ?? [], null, 2)}</pre>
        </section>

        <section className={sectionClass}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-semibold">Analytics benchmark</h2>
                {renderStatus(analyticsStatus)}
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                Controle la couverture du tracking, les scores recommandes, les profils utilisateurs et les signaux qui nourrissent le feed.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className={isAnalyticsLoading ? `${secondaryButtonClass} cursor-wait opacity-70` : secondaryButtonClass}
                disabled={isAnalyticsLoading || isRecomputingAnalytics}
                onClick={() => void loadAnalyticsBenchmark()}
                type="button"
              >
                {isAnalyticsLoading ? "Loading" : "Load benchmark"}
              </button>
              <button
                className={isRecomputingAnalytics ? `${secondaryButtonClass} cursor-wait opacity-70` : buttonClass}
                disabled={isAnalyticsLoading || isRecomputingAnalytics}
                onClick={() => void recomputeAnalyticsBenchmark()}
                type="button"
              >
                {isRecomputingAnalytics ? "Recomputing" : "Recompute scores"}
              </button>
            </div>
          </div>

          {analyticsAction ? (
            <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/60 dark:text-emerald-300">
              {analyticsAction}
            </p>
          ) : null}

          {analytics ? (
            <div className="mt-5 space-y-5">
              <div className="grid gap-3 lg:grid-cols-[1.1fr_2fr]">
                <div className={`rounded-lg border px-5 py-4 ${scoreTone(analytics.health.score)}`}>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em]">Algo health</p>
                  <div className="mt-3 flex items-end justify-between gap-4">
                    <p className="text-5xl font-semibold">{analytics.health.score}</p>
                    <p className="rounded-full bg-card/70 px-3 py-1 text-xs font-semibold uppercase">
                      {analytics.health.status}
                    </p>
                  </div>
                  <p className="mt-4 text-sm leading-6">
                    Version {analytics.scoreVersion}, dernier calcul {formatAge(analytics.health.latestScoreAgeMs)}.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className={miniCardClass}>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Events</p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">{analytics.counts.analyticsEvents}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{analytics.counts.analyticsEvents24h} sur 24 h</p>
                  </div>
                  <div className={miniCardClass}>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Beats publics</p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">{analytics.counts.publishedBeats}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatPercent(analytics.health.statsCoverage)} avec stats</p>
                  </div>
                  <div className={miniCardClass}>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Scores</p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">{analytics.counts.recommendationScores}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatPercent(analytics.health.scoreCoverage)} couverts</p>
                  </div>
                  <div className={miniCardClass}>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Users</p>
                    <p className="mt-2 text-2xl font-semibold text-foreground">{analytics.counts.users}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {analytics.counts.sellers} vendeurs, {analytics.counts.tasteProfiles} profils
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <div className="rounded-lg border border-border bg-card p-4">
                  <h3 className="font-semibold text-foreground">Top recommandations</h3>
                  <div className="mt-4 grid gap-3">
                    {analytics.topRecommendations.length > 0 ? (
                      analytics.topRecommendations.map((item, index) => (
                        <div className="rounded-lg border border-border bg-muted p-4" key={item.beatId}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                                #{index + 1} {item.reason ?? "organic"}
                              </p>
                              <p className="mt-1 truncate font-semibold text-foreground">{item.title}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {item.seller} · {item.genre ?? "genre n/a"} · {item.bpm ?? "-"} BPM
                              </p>
                            </div>
                            <p className="rounded-full bg-primary px-3 py-1 text-sm font-semibold text-primary-foreground">
                              {formatScore(item.organicScore)}
                            </p>
                          </div>
                          <div className="mt-4 grid gap-2 sm:grid-cols-2">
                            <ScoreBar label="engagement" value={item.scores.engagement} />
                            <ScoreBar label="sales" value={item.scores.sales} />
                            <ScoreBar label="freshness" value={item.scores.freshness} />
                            <ScoreBar label="seller" value={item.scores.seller} />
                          </div>
                          {item.stats ? (
                            <p className="mt-3 text-xs text-muted-foreground">
                              {item.stats.plays} plays · {item.stats.likes} likes · {item.stats.addToCart} carts · {item.stats.purchases} purchases
                            </p>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <p className="rounded-lg border border-dashed border-input p-4 text-sm text-muted-foreground">
                        Aucun score disponible. Lance le seed benchmark ou recalcule les scores.
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="rounded-lg border border-border bg-card p-4">
                    <h3 className="font-semibold text-foreground">Events par type</h3>
                    <div className="mt-4">
                      <BreakdownBars items={analytics.eventBreakdown} labelKey="type" />
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-4">
                    <h3 className="font-semibold text-foreground">Sources</h3>
                    <div className="mt-4">
                      <BreakdownBars items={analytics.sourceBreakdown} labelKey="source" />
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-4">
                    <h3 className="font-semibold text-foreground">Mix du feed</h3>
                    <div className="mt-4 grid gap-2">
                      {Object.entries(analytics.algorithm.feedMix).map(([label, value]) => (
                        <ScoreBar key={label} label={label} value={value} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <div className="rounded-lg border border-border bg-card p-4">
                  <h3 className="font-semibold text-foreground">Profils utilisateurs</h3>
                  <div className="mt-4 grid gap-3">
                    {analytics.tasteProfiles.length > 0 ? (
                      analytics.tasteProfiles.map((profile) => (
                        <div className="rounded-lg border border-border bg-muted p-4" key={profile.userId}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-foreground">{profile.displayName}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {profile.eventCount} events · BPM{" "}
                                {profile.preferredBpmRange ? profile.preferredBpmRange.join("-") : "n/a"}
                              </p>
                            </div>
                            <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">
                              taste
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {[...profile.favoriteGenres, ...profile.favoriteMoods, ...profile.favoriteTags]
                              .slice(0, 8)
                              .map((entry) => (
                                <span
                                  className="rounded-full bg-card px-3 py-1 text-xs font-medium text-foreground"
                                  key={`${profile.userId}-${entry.label}`}
                                >
                                  {entry.label} {formatScore(entry.score)}
                                </span>
                              ))}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-lg border border-dashed border-input p-4 text-sm text-muted-foreground">
                        Aucun profil de goût disponible. Il faut des interactions positives utilisateur.
                      </p>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-card p-4">
                  <h3 className="font-semibold text-foreground">Stats commerciales</h3>
                  <div className="mt-4 grid gap-3">
                    {analytics.topStats.length > 0 ? (
                      analytics.topStats.map((item) => (
                        <div className="rounded-lg border border-border bg-muted p-4" key={item.beatId}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-foreground">{item.title}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {item.seller} · {item.genre ?? "genre n/a"}
                              </p>
                            </div>
                            <p className="text-sm font-semibold text-foreground">{item.revenue} EUR</p>
                          </div>
                          <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                            <div className="rounded-xl bg-card p-2">
                              <p className="font-semibold text-foreground">{item.plays}</p>
                              <p className="text-muted-foreground">plays</p>
                            </div>
                            <div className="rounded-xl bg-card p-2">
                              <p className="font-semibold text-foreground">{item.addToCart}</p>
                              <p className="text-muted-foreground">carts</p>
                            </div>
                            <div className="rounded-xl bg-card p-2">
                              <p className="font-semibold text-foreground">{item.purchases}</p>
                              <p className="text-muted-foreground">sales</p>
                            </div>
                            <div className="rounded-xl bg-card p-2">
                              <p className="font-semibold text-foreground">{formatPercent(item.conversionRate * 100)}</p>
                              <p className="text-muted-foreground">conv.</p>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-lg border border-dashed border-input p-4 text-sm text-muted-foreground">
                        Aucune stats beat disponible.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-4">
                <h3 className="font-semibold text-foreground">Derniers signaux trackes</h3>
                <div className="mt-4 grid gap-2">
                  {analytics.latestEvents.map((event) => (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted px-4 py-3 text-sm" key={event.id}>
                      <div>
                        <p className="font-semibold text-foreground">{event.type}</p>
                        <p className="text-xs text-muted-foreground">
                          {event.beatTitle ?? "sans beat"} · {event.user ?? "anonyme"} · {event.source ?? "unknown"}
                        </p>
                      </div>
                      <p className="text-xs font-medium text-muted-foreground">
                        {new Date(event.occurredAt).toLocaleString("fr-FR")}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <pre className={preClass}>{JSON.stringify(analyticsRaw, null, 2)}</pre>
          )}
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className={sectionClass}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">GET /api/account/me</h2>
              {renderStatus(me.status)}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">Recupere le snapshot du compte courant.</p>
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
            <p className="mt-2 text-sm text-muted-foreground">Charge le profil public/prive du compte courant.</p>
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
            <p className="mt-2 text-sm text-muted-foreground">Edite le payload puis envoie la mise a jour du profil.</p>
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
            <p className="mt-2 text-sm text-muted-foreground">Liste les roles actuellement attaches au compte.</p>
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
          <p className="mt-2 text-sm text-muted-foreground">Teste la mise a jour self-service des roles avec un payload JSON.</p>
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
              <h2 className="text-lg font-semibold">POST /api/account-test/sentry</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Capture une exception de test dans Sentry puis retourne un <code>500</code> JSON avec l&apos;event id.
              </p>
            </div>
            {renderStatus(sentryTest.status)}
          </div>
          <button
            className={`mt-4 ${buttonClass}`}
            onClick={() =>
              run(async () => {
                setSentryTest(
                  await request("/api/account-test/sentry", {
                    method: "POST",
                    body: JSON.stringify({
                      source: "account-test",
                    }),
                  }),
                );
              })
            }
            type="button"
          >
            Trigger Sentry error
          </button>
          <pre className={preClass}>{JSON.stringify(sentryTest.body, null, 2)}</pre>
        </section>

        <section className={sectionClass}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">POST /api/account-test/email</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Envoie un email Resend reel avec un template transactionnel de test. Templates disponibles:{" "}
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
