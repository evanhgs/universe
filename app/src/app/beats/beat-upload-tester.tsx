"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";

type UploadKind = "audio-source" | "audio-licensed-archive" | "image-thumbnail";
type LicenseScope = "BASIC" | "PREMIUM" | "UNLIMITED" | "EXCLUSIVE" | "CUSTOM";

type LicenseDraft = {
  id: string;
  scope: LicenseScope;
  customTitle: string;
  priceAmount: string;
  file: File | null;
};

type PresignedAsset = {
  bucket: string;
  objectKey: string;
  originalFilename: string;
  mimeType: string;
  extension: string | null;
  sizeBytes: number;
};

type PresignResponse = {
  upload: {
    method: "PUT";
    url: string;
    headers: Record<string, string>;
    expiresIn: number;
  };
  asset: PresignedAsset;
};

type CreatedBeatResponse = {
  slug?: string;
  title?: string;
};

const CURRENCY = "EUR";
const MAX_LICENSES = 3;
const licenseLabels: Record<LicenseScope, string> = {
  BASIC: "MP3",
  PREMIUM: "WAV",
  UNLIMITED: "Pistes separees",
  EXCLUSIVE: "Exclusive",
  CUSTOM: "Personnalisee",
};
const licenseScopes: LicenseScope[] = ["BASIC", "PREMIUM", "UNLIMITED", "EXCLUSIVE", "CUSTOM"];

const inputClass =
  "h-11 w-full rounded-lg border border-black/15 px-4 text-sm outline-none focus:border-black";
const fileClass =
  "block w-full cursor-pointer rounded-lg border border-black/15 bg-white px-4 py-3 text-sm text-black file:mr-4 file:rounded-full file:border-0 file:bg-black file:px-4 file:py-2 file:text-sm file:font-medium file:text-white";
const labelClass = "text-sm font-medium text-black";
const helperClass = "mt-1 text-xs leading-5 text-black/50";

function extensionOf(filename: string) {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

function mimeTypeFor(file: File, kind: UploadKind) {
  if (file.type) {
    return file.type.toLowerCase();
  }

  const extension = extensionOf(file.name);

  if (extension === "mp3") {
    return "audio/mpeg";
  }

  if (extension === "wav") {
    return "audio/wav";
  }

  if (extension === "zip") {
    return "application/zip";
  }

  if (extension === "rar") {
    return "application/vnd.rar";
  }

  if (extension === "jpg" || extension === "jpeg") {
    return "image/jpeg";
  }

  if (extension === "png") {
    return "image/png";
  }

  if (extension === "webp") {
    return "image/webp";
  }

  return kind === "image-thumbnail" ? "image/jpeg" : "audio/mpeg";
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      body && typeof body === "object" && "message" in body
        ? String((body as { message: unknown }).message)
        : `HTTP ${response.status}`;

    throw new Error(message);
  }

  return body as T;
}

async function presignUpload(kind: UploadKind, file: File) {
  const response = await fetch("/api/storage/uploads/presign", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      kind,
      filename: file.name,
      mimeType: mimeTypeFor(file, kind),
      sizeBytes: file.size,
    }),
  });

  return readJsonResponse<PresignResponse>(response);
}

async function uploadToStorage(kind: UploadKind, file: File) {
  const presigned = await presignUpload(kind, file);
  const response = await fetch(presigned.upload.url, {
    method: presigned.upload.method,
    headers: presigned.upload.headers,
    body: file,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `storage_upload_failed_${response.status}`);
  }

  return presigned.asset;
}

function splitTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function createClientId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `license-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createLicenseDraft(scope: LicenseScope, priceAmount = "19.99"): LicenseDraft {
  return {
    id: createClientId(),
    scope,
    customTitle: "",
    priceAmount,
    file: null,
  };
}

function normalizeLicenseTitle(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function licenseTitle(license: LicenseDraft) {
  return license.scope === "CUSTOM"
    ? normalizeLicenseTitle(license.customTitle)
    : licenseLabels[license.scope];
}

function licenseTitleKey(value: string) {
  return normalizeLicenseTitle(value).toLowerCase();
}

function parsePriceAmount(value: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.round(parsed * 100) / 100;
}

function isPreviewSourceFile(file: File) {
  const mimeType = mimeTypeFor(file, "audio-source");
  const extension = extensionOf(file.name);

  return (
    mimeType === "audio/mpeg" ||
    mimeType === "audio/mp3" ||
    mimeType === "audio/wav" ||
    mimeType === "audio/x-wav" ||
    extension === "mp3" ||
    extension === "wav"
  );
}

export function BeatUploadTester() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [primaryGenre, setPrimaryGenre] = useState("");
  const [primaryMood, setPrimaryMood] = useState("");
  const [tags, setTags] = useState("");
  const [bpm, setBpm] = useState("");
  const [musicalKey, setMusicalKey] = useState("");
  const [publish, setPublish] = useState(true);
  const [licenses, setLicenses] = useState<LicenseDraft[]>([
    createLicenseDraft("BASIC"),
  ]);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdBeat, setCreatedBeat] = useState<CreatedBeatResponse | null>(null);

  const submitLabel = useMemo(() => {
    if (isSubmitting) {
      return "Upload en cours";
    }

    return publish ? "Uploader et publier" : "Uploader en brouillon";
  }, [isSubmitting, publish]);

  const usedScopes = useMemo(() => new Set(licenses.map((license) => license.scope)), [licenses]);

  function updateLicense(id: string, changes: Partial<LicenseDraft>) {
    setLicenses((current) =>
      current.map((license) => (license.id === id ? { ...license, ...changes } : license)),
    );
  }

  function addLicense() {
    const nextScope = licenseScopes.find((scope) => !usedScopes.has(scope));

    if (!nextScope || licenses.length >= MAX_LICENSES) {
      return;
    }

    setLicenses((current) => [...current, createLicenseDraft(nextScope, "49.99")]);
  }

  function removeLicense(id: string) {
    setLicenses((current) =>
      current.length > 1 ? current.filter((license) => license.id !== id) : current,
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (licenses.some((license) => !license.file)) {
      setError("Ajoute un fichier pour chaque licence.");
      return;
    }

    if (licenses.some((license) => license.scope === "CUSTOM" && !licenseTitle(license))) {
      setError("Nomme chaque licence personnalisee avant d'ajouter son fichier.");
      return;
    }

    const titleKeys = licenses.map((license) => licenseTitleKey(licenseTitle(license)));

    if (new Set(titleKeys).size !== titleKeys.length) {
      setError("Chaque type de licence doit etre unique dans une meme publication.");
      return;
    }

    const licensePrices = licenses.map((license) => parsePriceAmount(license.priceAmount));

    if (licensePrices.some((price) => price === null)) {
      setError("Chaque licence doit avoir un prix valide en EUR.");
      return;
    }

    const defaultLicense = licenses[0];
    const defaultFile = defaultLicense?.file;

    if (!defaultFile || !isPreviewSourceFile(defaultFile)) {
      setError("Le fichier de la premiere licence doit etre un MP3 ou WAV pour generer la preview.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setCreatedBeat(null);

    try {
      const uploadedLicenses = [];

      for (const [index, license] of licenses.entries()) {
        const file = license.file;

        if (!file) {
          throw new Error("license_file_missing");
        }

        const kind: UploadKind = index === 0 ? "audio-source" : "audio-licensed-archive";
        setStatus(`Upload ${licenseTitle(license)} vers S3...`);
        const asset = await uploadToStorage(kind, file);
        const price = licensePrices[index];

        if (price === null) {
          throw new Error("license_price_invalid");
        }

        uploadedLicenses.push({
          draft: license,
          asset,
          price,
        });
      }

      const audioAsset = uploadedLicenses[0].asset;
      const lowestPrice = Math.min(...uploadedLicenses.map((license) => license.price));
      const isFree = uploadedLicenses.every((license) => license.price === 0);

      let thumbnailAsset: PresignedAsset | null = null;

      if (thumbnailFile) {
        setStatus("Presign et upload image vers S3...");
        thumbnailAsset = await uploadToStorage("image-thumbnail", thumbnailFile);
      }

      setStatus("Creation de l instrumentale via /api/beats...");
      const response = await fetch("/api/beats", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          description,
          priceAmount: lowestPrice,
          currency: CURRENCY,
          primaryGenre,
          primaryMood,
          tags: splitTags(tags),
          bpm: bpm ? Number(bpm) : null,
          musicalKey,
          visibility: "PUBLIC",
          publish,
          isFree,
          brandingRequired: isFree,
          audioAsset,
          thumbnailAsset,
          licenseOfferings: uploadedLicenses.map((license, index) => ({
            scope: license.draft.scope,
            title: licenseTitle(license.draft),
            priceAmount: license.price,
            currency: CURRENCY,
            isDefault: index === 0,
            assets: [license.asset],
          })),
        }),
      });
      const beat = await readJsonResponse<CreatedBeatResponse>(response);

      setCreatedBeat(beat);
      setStatus(`Instrumentale creee${beat.slug ? `: /beats/${beat.slug}` : "."}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
      setStatus(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="mt-8 border border-black/10 bg-white p-5">
      <div className="flex flex-col gap-3 border-b border-black/10 pb-5 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-black/45">
            Test upload S3
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-black">
            Ajouter une instrumentale
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-black/60">
            Ce formulaire appelle <code>/api/storage/uploads/presign</code>, envoie les fichiers
            vers S3, puis cree le beat avec <code>/api/beats</code>.
          </p>
        </div>
        {createdBeat?.slug ? (
          <a
            className="inline-flex h-10 items-center justify-center rounded-full border border-black px-4 text-sm font-medium text-black"
            href={`/beats/${createdBeat.slug}`}
          >
            Ouvrir la fiche
          </a>
        ) : null}
      </div>

      <form className="mt-5 grid gap-5" onSubmit={(event) => void handleSubmit(event)}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className={labelClass}>
            Titre
            <input
              className={`mt-2 ${inputClass}`}
              maxLength={140}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Midnight Bounce"
              required
              value={title}
            />
          </label>
          <label className={labelClass}>
            Genre
            <input
              className={`mt-2 ${inputClass}`}
              onChange={(event) => setPrimaryGenre(event.target.value)}
              placeholder="Trap"
              value={primaryGenre}
            />
          </label>
          <label className={labelClass}>
            Mood
            <input
              className={`mt-2 ${inputClass}`}
              onChange={(event) => setPrimaryMood(event.target.value)}
              placeholder="Dark"
              value={primaryMood}
            />
          </label>
          <label className={labelClass}>
            BPM
            <input
              className={`mt-2 ${inputClass}`}
              max="300"
              min="20"
              onChange={(event) => setBpm(event.target.value)}
              placeholder="140"
              type="number"
              value={bpm}
            />
          </label>
          <label className={labelClass}>
            Tonalite
            <input
              className={`mt-2 ${inputClass}`}
              onChange={(event) => setMusicalKey(event.target.value)}
              placeholder="F minor"
              value={musicalKey}
            />
          </label>
          <label className={labelClass}>
            Tags
            <input
              className={`mt-2 ${inputClass}`}
              onChange={(event) => setTags(event.target.value)}
              placeholder="club, bounce, 808"
              value={tags}
            />
          </label>
          <div className={labelClass}>
            Devise
            <div className="mt-2 flex h-11 items-center rounded-lg border border-black/10 bg-black/[0.03] px-4 text-sm text-black/65">
              EUR
            </div>
            <p className={helperClass}>Devise fixee en V1. Le choix pourra etre gere plus tard au paiement.</p>
          </div>
        </div>

        <label className={labelClass}>
          Description
          <textarea
            className="mt-2 min-h-24 w-full rounded-lg border border-black/15 px-4 py-3 text-sm leading-6 outline-none focus:border-black"
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Notes rapides pour tester la publication."
            value={description}
          />
        </label>

        <div className="grid gap-4">
          <div className="flex flex-col gap-3 border-t border-black/10 pt-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-black">Licences</p>
              <p className={helperClass}>
                Maximum 3. La premiere licence sert de source pour generer automatiquement la preview.
              </p>
            </div>
            <button
              className="inline-flex h-10 items-center justify-center rounded-full border border-black px-4 text-sm font-medium text-black disabled:cursor-not-allowed disabled:border-black/20 disabled:text-black/35"
              disabled={licenses.length >= MAX_LICENSES}
              onClick={addLicense}
              type="button"
            >
              Ajouter une licence
            </button>
          </div>

          <div className="grid gap-3">
            {licenses.map((license, index) => (
              <div
                className="grid gap-3 border border-black/10 p-4 md:grid-cols-[220px_160px_1fr_auto]"
                key={license.id}
              >
                <label className={labelClass}>
                  Type de licence
                  <select
                    className={`mt-2 ${inputClass}`}
                    onChange={(event) => {
                      const scope = event.target.value as LicenseScope;
                      updateLicense(license.id, {
                        scope,
                        customTitle: scope === "CUSTOM" ? license.customTitle : "",
                      });
                    }}
                    value={license.scope}
                  >
                    {licenseScopes.map((scope) => (
                      <option
                        disabled={scope !== license.scope && usedScopes.has(scope)}
                        key={scope}
                        value={scope}
                      >
                        {licenseLabels[scope]}
                      </option>
                    ))}
                  </select>
                  {license.scope === "CUSTOM" ? (
                    <input
                      className={`mt-2 ${inputClass}`}
                      maxLength={80}
                      onChange={(event) =>
                        updateLicense(license.id, { customTitle: event.target.value })
                      }
                      placeholder="Nom de la licence"
                      required
                      value={license.customTitle}
                    />
                  ) : null}
                </label>

                <label className={labelClass}>
                  Prix EUR
                  <input
                    className={`mt-2 ${inputClass}`}
                    min="0"
                    onChange={(event) =>
                      updateLicense(license.id, { priceAmount: event.target.value })
                    }
                    placeholder="19.99"
                    required
                    step="0.01"
                    type="number"
                    value={license.priceAmount}
                  />
                </label>

                <label className={labelClass}>
                  Fichier
                  <input
                    accept={
                      index === 0
                        ? "audio/mpeg,audio/mp3,audio/wav,audio/x-wav"
                        : "audio/mpeg,audio/mp3,audio/wav,audio/x-wav,application/zip,application/x-rar-compressed,application/vnd.rar,.zip,.rar"
                    }
                    className={`mt-2 ${fileClass}`}
                    onChange={(event) =>
                      updateLicense(license.id, { file: event.target.files?.[0] ?? null })
                    }
                    required
                    type="file"
                  />
                  <p className={helperClass}>
                    {index === 0
                      ? "MP3 ou WAV requis pour la preview. Maximum API: 250 Mo."
                      : "MP3, WAV, ZIP ou RAR. Maximum API: 250 Mo."}
                  </p>
                </label>

                <div className="flex items-end">
                  <button
                    className="h-10 rounded-full border border-black/15 px-4 text-sm font-medium text-black disabled:cursor-not-allowed disabled:text-black/30"
                    disabled={licenses.length === 1}
                    onClick={() => removeLicense(license.id)}
                    type="button"
                  >
                    Retirer
                  </button>
                </div>
              </div>
            ))}
          </div>

          <label className={labelClass}>
            Image
            <input
              accept="image/jpeg,image/png,image/webp"
              className={`mt-2 ${fileClass}`}
              onChange={(event) => setThumbnailFile(event.target.files?.[0] ?? null)}
              type="file"
            />
            <p className={helperClass}>JPEG, PNG ou WebP. Maximum API: 10 Mo.</p>
          </label>
        </div>

        <div className="flex flex-wrap gap-4 border-t border-black/10 pt-5 text-sm text-black/70">
          <label className="inline-flex items-center gap-2">
            <input
              checked={publish}
              className="h-4 w-4 accent-black"
              onChange={(event) => setPublish(event.target.checked)}
              type="checkbox"
            />
            Publier directement
          </label>
        </div>

        {status ? (
          <p className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            {status}
          </p>
        ) : null}
        {error ? (
          <p className="border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            className="inline-flex h-11 items-center justify-center rounded-full bg-black px-5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-black/40"
            disabled={isSubmitting}
            type="submit"
          >
            {submitLabel}
          </button>
          <p className="text-sm leading-6 text-black/50">
            Il faut etre connecte avec un compte vendeur, sinon l API renverra
            <code> seller_role_required</code>.
          </p>
        </div>
      </form>
    </section>
  );
}
