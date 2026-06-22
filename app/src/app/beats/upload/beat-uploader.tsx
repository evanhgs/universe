"use client";

import {
  ChevronDown,
  FileAudio,
  Filter,
  ImagePlus,
  Pencil,
  Plus,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { SyntheticEvent, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  BEAT_METADATA_LIMITS,
  BEAT_TAGS,
  MAIN_GENRES,
  MOODS,
  USAGE_TAGS,
  labelForBeatMetadata,
  secondGenresForMainGenres,
  type MainGenre,
  type Mood,
  type SecondGenre,
  type Tag,
  type UsageTag,
} from "@/lib/beat-metadata";
import { API_PATHS, PAGE_PATHS } from "@/lib/paths";

type UploadKind = "audio-source" | "audio-licensed-archive" | "image-thumbnail";
type LicenseScope = "BASIC" | "PREMIUM" | "UNLIMITED" | "EXCLUSIVE" | "CUSTOM";
type Visibility = "PUBLIC" | "UNLISTED" | "PRIVATE";

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
const licenseScopes: LicenseScope[] = ["BASIC", "PREMIUM", "UNLIMITED", "EXCLUSIVE", "CUSTOM"];
const licenseLabels: Record<LicenseScope, string> = {
  BASIC: "MP3",
  PREMIUM: "WAV",
  UNLIMITED: "Pistes separees",
  EXCLUSIVE: "Exclusive",
  CUSTOM: "Personnalisee",
};

const visibilityLabels: Record<Visibility, string> = {
  PUBLIC: "Public",
  UNLISTED: "Non liste",
  PRIVATE: "Prive",
};

function extensionOf(filename: string) {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

function mimeTypeFor(file: File, kind: UploadKind) {
  if (file.type) {
    return file.type.toLowerCase();
  }

  switch (extensionOf(file.name)) {
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "zip":
      return "application/zip";
    case "rar":
      return "application/vnd.rar";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    default:
      return kind === "image-thumbnail" ? "image/jpeg" : "audio/mpeg";
  }
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
  const response = await fetch(API_PATHS.storage.uploads.presign(), {
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

function toggleValue<T extends string>(values: T[], value: T, limit: number) {
  if (values.includes(value)) {
    return values.filter((item) => item !== value);
  }

  if (values.length >= limit) {
    return values;
  }

  return [...values, value];
}

function MetadataChecklist<T extends string>({
  title,
  values,
  selected,
  limit,
  disabledValues = [],
  onChange,
}: {
  title: string;
  values: readonly T[];
  selected: T[];
  limit: number;
  disabledValues?: readonly T[];
  onChange: (values: T[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(title === "Genres principaux");
  const [query, setQuery] = useState("");
  const [sortAlpha, setSortAlpha] = useState(false);
  const disabledSet = new Set(disabledValues);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleValues = useMemo(() => {
    const filtered = values.filter((value) =>
      labelForBeatMetadata(value).toLowerCase().includes(normalizedQuery),
    );

    return sortAlpha
      ? [...filtered].sort((a, b) =>
          labelForBeatMetadata(a).localeCompare(labelForBeatMetadata(b), "fr"),
        )
      : filtered;
  }, [normalizedQuery, sortAlpha, values]);

  return (
    <div className="overflow-hidden rounded-lg border border-foreground/15 bg-card shadow-sm">
      <button
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 border-b border-foreground/10 bg-muted/35 px-4 py-3 text-left transition hover:bg-muted"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span className="flex min-w-0 items-center gap-3">
          <ChevronDown
            className={`size-4 shrink-0 text-muted-foreground transition ${isOpen ? "rotate-0" : "-rotate-90"}`}
          />
          <span className="truncate text-sm font-semibold text-foreground">{title}</span>
        </span>
        <Badge variant={selected.length >= limit ? "warning" : selected.length > 0 ? "primary" : "muted"}>
          {selected.length}/{limit}
        </Badge>
      </button>
      {isOpen ? (
        <div className="grid gap-3 p-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <Input
              className="h-10"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filtrer les valeurs"
              value={query}
            />
            <Button
              aria-pressed={sortAlpha}
              className={sortAlpha ? "border-primary text-primary" : undefined}
              onClick={() => setSortAlpha((current) => !current)}
              title="Trier les valeurs"
              type="button"
              variant="outline"
            >
              <Filter className="size-4" />
              A-Z
            </Button>
          </div>
          {visibleValues.length === 0 ? (
            <p className="rounded-md border border-dashed border-foreground/20 bg-background px-3 py-4 text-sm text-muted-foreground">
              Aucune valeur disponible.
            </p>
          ) : (
            <div className="grid max-h-60 gap-2 overflow-y-auto rounded-md border border-foreground/10 bg-background p-2 sm:grid-cols-2">
              {visibleValues.map((value) => {
                const checked = selected.includes(value);
                const disabled = disabledSet.has(value) || (!checked && selected.length >= limit);

                return (
                  <label
                    className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-transparent px-2 text-sm text-foreground transition hover:border-foreground/15 hover:bg-muted data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-45"
                    data-disabled={disabled}
                    key={value}
                  >
                    <Checkbox
                      checked={checked}
                      className="border-foreground/40 bg-background shadow-sm data-[state=checked]:border-primary"
                      disabled={disabled}
                      onCheckedChange={() => onChange(toggleValue(selected, value, limit))}
                    />
                    <span className="truncate">{labelForBeatMetadata(value)}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function LicenseEditorDialog({
  draft,
  open,
  usedScopes,
  onOpenChange,
  onSave,
}: {
  draft: LicenseDraft;
  open: boolean;
  usedScopes: Set<LicenseScope>;
  onOpenChange: (open: boolean) => void;
  onSave: (draft: LicenseDraft) => void;
}) {
  const [localDraft, setLocalDraft] = useState<LicenseDraft>(draft);

  function updateLocal(changes: Partial<LicenseDraft>) {
    setLocalDraft((current) => (current ? { ...current, ...changes } : current));
  }

  function saveLicense() {
    onSave(localDraft);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Configurer une licence</DialogTitle>
          <DialogDescription>
            Definis le type, le prix et le fichier livre avec cette offre.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5">
          <div className="grid gap-2">
            <Label>Type de licence</Label>
            <Select
              onValueChange={(value) => updateLocal({ scope: value as LicenseScope })}
              value={localDraft.scope}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {licenseScopes.map((scope) => (
                  <SelectItem
                    disabled={scope !== localDraft.scope && usedScopes.has(scope)}
                    key={scope}
                    value={scope}
                  >
                    {licenseLabels[scope]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {localDraft.scope === "CUSTOM" ? (
            <div className="grid gap-2">
              <Label htmlFor="license-dialog-title">Nom de la licence</Label>
              <Input
                id="license-dialog-title"
                onChange={(event) => updateLocal({ customTitle: event.target.value })}
                placeholder="Licence studio"
                value={localDraft.customTitle}
              />
            </div>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="license-dialog-price">Prix EUR</Label>
            <Input
              id="license-dialog-price"
              min="0"
              onChange={(event) => updateLocal({ priceAmount: event.target.value })}
              step="0.01"
              type="number"
              value={localDraft.priceAmount}
            />
          </div>
          <label className="grid cursor-pointer gap-2 rounded-lg border border-dashed border-foreground/25 bg-background p-4">
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              <FileAudio className="size-4" />
              Fichier de livraison
            </span>
            <Input
              accept="audio/mpeg,audio/wav,application/zip,application/vnd.rar"
              onChange={(event) => updateLocal({ file: event.target.files?.[0] ?? null })}
              type="file"
            />
            {localDraft.file ? (
              <span className="truncate text-xs text-muted-foreground">{localDraft.file.name}</span>
            ) : null}
          </label>
          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
              Annuler
            </Button>
            <Button onClick={saveLicense} type="button">
              Enregistrer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function BeatUpload() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [bpm, setBpm] = useState("");
  const [musicalKey, setMusicalKey] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("PUBLIC");
  const [publish, setPublish] = useState(true);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [mainGenres, setMainGenres] = useState<MainGenre[]>([]);
  const [secondGenres, setSecondGenres] = useState<SecondGenre[]>([]);
  const [moods, setMoods] = useState<Mood[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [usageTags, setUsageTags] = useState<UsageTag[]>([]);
  const [licenses, setLicenses] = useState<LicenseDraft[]>([createLicenseDraft("BASIC")]);
  const [licenseDialogOpen, setLicenseDialogOpen] = useState(false);
  const [licenseDialogDraft, setLicenseDialogDraft] = useState<LicenseDraft | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [createdBeat, setCreatedBeat] = useState<CreatedBeatResponse | null>(null);

  const availableSecondGenres = useMemo(
    () => secondGenresForMainGenres(mainGenres),
    [mainGenres],
  );
  const unavailableSecondGenres = useMemo(
    () => secondGenres.filter((genre) => !availableSecondGenres.includes(genre)),
    [availableSecondGenres, secondGenres],
  );
  const usedScopes = useMemo(() => new Set(licenses.map((license) => license.scope)), [licenses]);
  const usedScopesForDialog = useMemo(
    () =>
      new Set(
        licenses
          .filter((license) => license.id !== licenseDialogDraft?.id)
          .map((license) => license.scope),
      ),
    [licenseDialogDraft?.id, licenses],
  );
  const submitLabel = isSubmitting
    ? "Upload en cours"
    : publish
      ? "Uploader et publier"
      : "Uploader en brouillon";

  function openAddLicenseDialog() {
    const nextScope = licenseScopes.find((scope) => !usedScopes.has(scope));

    if (!nextScope || licenses.length >= MAX_LICENSES) {
      return;
    }

    setLicenseDialogDraft(createLicenseDraft(nextScope, "49.99"));
    setLicenseDialogOpen(true);
  }

  function openEditLicenseDialog(license: LicenseDraft) {
    setLicenseDialogDraft({ ...license });
    setLicenseDialogOpen(true);
  }

  function saveLicenseDialog(draft: LicenseDraft) {
    setLicenses((current) => {
      const exists = current.some((license) => license.id === draft.id);

      return exists
        ? current.map((license) => (license.id === draft.id ? draft : license))
        : [...current, draft];
    });
  }

  function removeLicense(id: string) {
    setLicenses((current) =>
      current.length > 1 ? current.filter((license) => license.id !== id) : current,
    );
  }

  function setMainGenresSafely(values: MainGenre[]) {
    setMainGenres(values);
    const allowedSecondGenres = secondGenresForMainGenres(values);
    setSecondGenres((current) => current.filter((genre) => allowedSecondGenres.includes(genre)));
  }

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedTitle = title.trim();
    const licensePrices = licenses.map((license) => parsePriceAmount(license.priceAmount));

    if (!normalizedTitle) {
      setError("Ajouter un titre avant d'uploader.");
      return;
    }

    if (publish && !thumbnailFile) {
      setError("Ajouter une miniature avant de publier.");
      return;
    }

    if (mainGenres.length === 0) {
      setError("Selectionner au moins un genre principal.");
      return;
    }

    if (licenses.some((license) => !license.file)) {
      setError("Ajouter un fichier pour chaque licence.");
      return;
    }

    if (licenses.some((license) => license.scope === "CUSTOM" && !licenseTitle(license))) {
      setError("Nommer chaque licence personnalisee.");
      return;
    }

    if (licensePrices.some((price) => price === null)) {
      setError("Chaque licence doit avoir un prix valide en EUR.");
      return;
    }

    const defaultFile = licenses[0]?.file;

    if (!defaultFile || !isPreviewSourceFile(defaultFile)) {
      setError("Le fichier de la premiere licence doit etre un MP3 ou WAV.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setStatus("Preparation des fichiers...");
    setCreatedBeat(null);

    try {
      const uploadedLicenses = [];

      for (const [index, license] of licenses.entries()) {
        const file = license.file;

        if (!file) {
          throw new Error("license_file_missing");
        }

        const kind: UploadKind = index === 0 ? "audio-source" : "audio-licensed-archive";
        setStatus(`Upload ${licenseTitle(license)} vers le stockage...`);
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

      let thumbnailAsset: PresignedAsset | null = null;

      if (thumbnailFile) {
        setStatus("Upload de la miniature...");
        thumbnailAsset = await uploadToStorage("image-thumbnail", thumbnailFile);
      }

      const audioAsset = uploadedLicenses[0].asset;
      const lowestPrice = Math.min(...uploadedLicenses.map((license) => license.price));
      const isFree = uploadedLicenses.every((license) => license.price === 0);

      setStatus("Creation de la publication...");
      const response = await fetch(API_PATHS.beats.list(), {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: normalizedTitle,
          description: description.trim() || null,
          priceAmount: lowestPrice,
          currency: CURRENCY,
          mainGenres,
          secondGenres,
          moods,
          tags,
          usageTags,
          bpm: bpm ? Number(bpm) : null,
          musicalKey: musicalKey.trim() || null,
          visibility,
          publish,
          isFree,
          brandingRequired: isFree,
          audioAsset,
          thumbnailAsset,
          licenseOfferings: uploadedLicenses.map(({ draft, asset, price }, index) => ({
            scope: draft.scope,
            title: licenseTitle(draft),
            priceAmount: price,
            currency: CURRENCY,
            isDefault: index === 0,
            assets: [asset],
          })),
        }),
      });
      const beat = await readJsonResponse<CreatedBeatResponse>(response);

      setCreatedBeat(beat);
      setStatus(beat.slug ? `Beat cree : ${PAGE_PATHS.beats.detail.getHref(beat.slug)}` : "Beat cree.");

      if (beat.slug) {
        router.push(PAGE_PATHS.beats.detail.getHref(beat.slug));
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
      setStatus(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto min-h-[calc(100vh-73px)] w-full max-w-7xl px-6 py-10">
      <div className="border-b border-border pb-8">
        <p className="text-sm font-medium uppercase text-muted-foreground">Publication</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground">
          Uploader un beat
        </h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground">
          Publie une instru avec ses fichiers de licence, sa miniature et des metadonnees propres
          pour le catalogue et le feed.
        </p>
      </div>

      <form className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]" onSubmit={handleSubmit}>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Informations</CardTitle>
              <CardDescription>Titre, description et donnees musicales principales.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <div className="grid gap-2">
                <Label htmlFor="beat-title">Titre</Label>
                <Input
                  id="beat-title"
                  maxLength={140}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Dark Piano Drill"
                  required
                  value={title}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="beat-description">Description</Label>
                <Textarea
                  id="beat-description"
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Ambiance, inspirations, contexte d'utilisation..."
                  value={description}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="beat-bpm">BPM</Label>
                  <Input
                    id="beat-bpm"
                    max="300"
                    min="20"
                    onChange={(event) => setBpm(event.target.value)}
                    placeholder="140"
                    type="number"
                    value={bpm}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="beat-key">Tonalite</Label>
                  <Input
                    id="beat-key"
                    onChange={(event) => setMusicalKey(event.target.value)}
                    placeholder="Am"
                    value={musicalKey}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Visibilite</Label>
                  <Select onValueChange={(value) => setVisibility(value as Visibility)} value={visibility}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(visibilityLabels) as Visibility[]).map((value) => (
                        <SelectItem key={value} value={value}>
                          {visibilityLabels[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-foreground/15">
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>Licences et fichiers livres</CardTitle>
                  <CardDescription>
                    Configure les offres qui seront visibles sur la page du beat.
                  </CardDescription>
                </div>
                <Button
                  disabled={licenses.length >= MAX_LICENSES || usedScopes.size >= licenseScopes.length}
                  onClick={openAddLicenseDialog}
                  type="button"
                  variant="outline"
                >
                  <Plus className="size-4" />
                  Ajouter
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3">
              {licenses.map((license, index) => {
                const price = parsePriceAmount(license.priceAmount);

                return (
                  <div
                    className="grid gap-3 rounded-lg border border-foreground/15 bg-background p-4 shadow-sm md:grid-cols-[1fr_auto]"
                    key={license.id}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={index === 0 ? "primary" : "secondary"}>
                          {index === 0 ? "Source preview" : "Livraison"}
                        </Badge>
                        <h3 className="truncate text-base font-semibold text-foreground">
                          {licenseTitle(license) || "Licence sans nom"}
                        </h3>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span>{price === null ? "Prix invalide" : `${price.toFixed(2)} EUR`}</span>
                        <span>{license.file ? license.file.name : "Aucun fichier selectionne"}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => openEditLicenseDialog(license)}
                        type="button"
                        variant="outline"
                      >
                        <Pencil className="size-4" />
                        Modifier
                      </Button>
                      <Button
                        disabled={licenses.length === 1}
                        onClick={() => removeLicense(license.id)}
                        size="icon"
                        title="Supprimer la licence"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Metadonnees</CardTitle>
              <CardDescription>Ces choix alimentent le catalogue, les filtres et le feed.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <MetadataChecklist
                limit={BEAT_METADATA_LIMITS.mainGenres}
                onChange={setMainGenresSafely}
                selected={mainGenres}
                title="Genres principaux"
                values={MAIN_GENRES}
              />
              <MetadataChecklist
                disabledValues={unavailableSecondGenres}
                limit={BEAT_METADATA_LIMITS.secondGenres}
                onChange={setSecondGenres}
                selected={secondGenres}
                title="Sous-genres"
                values={availableSecondGenres.length > 0 ? availableSecondGenres : []}
              />
              <MetadataChecklist
                limit={BEAT_METADATA_LIMITS.moods}
                onChange={setMoods}
                selected={moods}
                title="Moods"
                values={MOODS}
              />
              <MetadataChecklist
                limit={BEAT_METADATA_LIMITS.tags}
                onChange={setTags}
                selected={tags}
                title="Tags sonores"
                values={BEAT_TAGS}
              />
              <MetadataChecklist
                limit={BEAT_METADATA_LIMITS.usageTags}
                onChange={setUsageTags}
                selected={usageTags}
                title="Usages"
                values={USAGE_TAGS}
              />
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Assets</CardTitle>
              <CardDescription>Miniature obligatoire pour publier.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <label className="grid cursor-pointer gap-2 rounded-lg border border-dashed border-border p-4">
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <ImagePlus className="size-4" />
                  Miniature
                </span>
                <Input
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => setThumbnailFile(event.target.files?.[0] ?? null)}
                  type="file"
                />
                {thumbnailFile ? (
                  <span className="truncate text-xs text-muted-foreground">{thumbnailFile.name}</span>
                ) : null}
              </label>
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Publier directement</p>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Sinon, la publication reste en brouillon.
                  </p>
                </div>
                <Switch checked={publish} onCheckedChange={setPublish} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-5">
              {status ? (
                <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{status}</p>
              ) : null}
              {error ? (
                <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              {createdBeat ? (
                <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300">
                  {createdBeat.title ?? "Beat cree"}
                </p>
              ) : null}
              <Button className="w-full" disabled={isSubmitting} size="lg" type="submit">
                <UploadCloud className="size-4" />
                {submitLabel}
              </Button>
            </CardContent>
          </Card>
        </aside>
        {licenseDialogDraft ? (
          <LicenseEditorDialog
            draft={licenseDialogDraft}
            onOpenChange={(open) => {
              setLicenseDialogOpen(open);

              if (!open) {
                setLicenseDialogDraft(null);
              }
            }}
            onSave={saveLicenseDialog}
            open={licenseDialogOpen}
            usedScopes={usedScopesForDialog}
          />
        ) : null}
      </form>
    </main>
  );
}
