import { formatBeatPrice, formatEnumLabel, type LandingBeat } from "./types";

/**
 * Teintes par genre principal pour les visuels generatifs.
 * Faute de cover uploadee, chaque beat obtient un artwork deterministe
 * derive de son id et colore par son genre.
 */
const GENRE_HUES: Record<string, number> = {
  TRAP: 262,
  DRILL: 288,
  R_AND_B: 322,
  AFRO: 24,
  POP: 204,
  BOOM_BAP: 44,
  JERSEY_CLUB: 188,
  DANCEHALL: 96,
  AMAPIANO: 152,
  HIP_HOP: 262,
  REGGAETON: 8,
  HOUSE: 210,
};

const MONO_FONT =
  'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

/**
 * Hash FNV-1a 32 bits d'une chaine pour seeder le PRNG.
 * @param value Chaine source (id du beat).
 */
function hashString(value: string) {
  let hash = 0x811c9dc5;

  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

/**
 * PRNG mulberry32 deterministe.
 * @param seed Graine 32 bits.
 */
function mulberry32(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Retourne la teinte associee au beat (genre connu ou derive du hash).
 * @param beat Beat landing.
 */
export function beatHue(beat: Pick<LandingBeat, "id" | "genre">) {
  const genreHue = beat.genre ? GENRE_HUES[beat.genre] : undefined;

  if (genreHue !== undefined) {
    return genreHue;
  }

  return 240 + (hashString(beat.id) % 60);
}

/**
 * Peint l'artwork generatif d'un beat : halo colore, anneau waveform,
 * lignes techniques. Deterministe par id de beat.
 * @param ctx Contexte 2D cible.
 * @param beat Beat source.
 * @param x Origine X de la zone artwork.
 * @param y Origine Y de la zone artwork.
 * @param size Cote de la zone artwork carree.
 */
export function paintCoverArt(
  ctx: CanvasRenderingContext2D,
  beat: Pick<LandingBeat, "id" | "genre" | "bpm">,
  x: number,
  y: number,
  size: number,
) {
  const rnd = mulberry32(hashString(beat.id));
  const hue = beatHue(beat);

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, size, size);
  ctx.clip();

  ctx.fillStyle = "#0b0b0f";
  ctx.fillRect(x, y, size, size);

  const glowX = x + size * (0.25 + rnd() * 0.5);
  const glowY = y + size * (0.25 + rnd() * 0.5);
  const glow = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, size * 0.75);
  glow.addColorStop(0, `hsla(${hue}, 85%, 58%, 0.5)`);
  glow.addColorStop(0.55, `hsla(${hue}, 80%, 40%, 0.16)`);
  glow.addColorStop(1, "hsla(0, 0%, 0%, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(x, y, size, size);

  // Fines lignes horizontales facon scanline.
  ctx.strokeStyle = "rgba(255, 255, 255, 0.045)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    const lineY = y + (size / 5) * i + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, lineY);
    ctx.lineTo(x + size, lineY);
    ctx.stroke();
  }

  // Anneau waveform : barres radiales modulees.
  const cx = x + size / 2;
  const cy = y + size / 2;
  const baseRadius = size * 0.26;
  const bars = 88;
  const phase = rnd() * Math.PI * 2;
  const harmonic = 3 + Math.floor(rnd() * 5);

  for (let i = 0; i < bars; i++) {
    const angle = (i / bars) * Math.PI * 2;
    const wave = Math.abs(Math.sin(angle * harmonic + phase));
    const jitter = rnd();
    const length = size * 0.035 + wave * size * 0.1 + jitter * size * 0.05;
    const inner = baseRadius;
    const outer = baseRadius + length;
    const alpha = 0.35 + wave * 0.55;

    ctx.strokeStyle = `hsla(${hue}, 90%, ${62 + wave * 16}%, ${alpha})`;
    ctx.lineWidth = Math.max(1, size * 0.006);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
    ctx.stroke();
  }

  // Coeur de l'anneau.
  ctx.strokeStyle = `hsla(${hue}, 85%, 70%, 0.9)`;
  ctx.lineWidth = Math.max(1, size * 0.004);
  ctx.beginPath();
  ctx.arc(cx, cy, baseRadius * 0.94, 0, Math.PI * 2);
  ctx.stroke();

  // Reperes techniques aux coins.
  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.lineWidth = 1;
  const mark = size * 0.045;
  const inset = size * 0.06;
  const corners: Array<[number, number, number, number]> = [
    [x + inset, y + inset, 1, 1],
    [x + size - inset, y + inset, -1, 1],
    [x + inset, y + size - inset, 1, -1],
    [x + size - inset, y + size - inset, -1, -1],
  ];
  for (const [cornerX, cornerY, dirX, dirY] of corners) {
    ctx.beginPath();
    ctx.moveTo(cornerX + mark * dirX, cornerY);
    ctx.lineTo(cornerX, cornerY);
    ctx.lineTo(cornerX, cornerY + mark * dirY);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Peint la texture complete d'une carte de la grille : fond, artwork,
 * metadonnees typographiques aux quatre coins (facon phantom.land).
 * @param canvas Canvas cible (redimensionne par la fonction).
 * @param beat Beat source.
 * @param width Largeur texture en pixels.
 * @param height Hauteur texture en pixels.
 */
export function paintCardTexture(
  canvas: HTMLCanvasElement,
  beat: LandingBeat,
  width: number,
  height: number,
) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return;
  }

  ctx.fillStyle = "#0d0d13";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.09)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);

  const artSize = width * 0.8;
  const artX = (width - artSize) / 2;
  const artY = (height - artSize) / 2;
  paintCoverArt(ctx, beat, artX, artY, artSize);

  const pad = width * 0.055;
  const small = Math.round(width * 0.042);
  ctx.textBaseline = "top";

  // Vendeur en haut a gauche.
  ctx.font = `500 ${small}px ${MONO_FONT}`;
  ctx.fillStyle = "rgba(224, 224, 235, 0.62)";
  ctx.textAlign = "left";
  ctx.fillText(truncate(ctx, beat.sellerName.toUpperCase(), width * 0.42), pad, pad);

  // Titre en haut a droite.
  ctx.fillStyle = "rgba(240, 240, 248, 0.94)";
  ctx.textAlign = "right";
  ctx.fillText(truncate(ctx, beat.title.toUpperCase(), width * 0.46), width - pad, pad);

  // Genre / BPM en bas a gauche.
  ctx.textBaseline = "bottom";
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(224, 224, 235, 0.62)";
  const genreLabel = formatEnumLabel(beat.genre);
  const bpmLabel = beat.bpm ? `${beat.bpm} BPM` : "";
  const meta = [genreLabel, bpmLabel].filter(Boolean).join(" — ");
  ctx.fillText(truncate(ctx, meta, width * 0.55), pad, height - pad);

  // Prix en bas a droite.
  ctx.textAlign = "right";
  ctx.fillStyle = "hsla(262, 100%, 78%, 0.95)";
  ctx.fillText(formatBeatPrice(beat), width - pad, height - pad);
}

/**
 * Tronque un texte pour tenir dans une largeur maximale donnee.
 * @param ctx Contexte 2D avec la police active.
 * @param text Texte source.
 * @param maxWidth Largeur maximale en pixels.
 */
function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }

  let result = text;

  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1);
  }

  return `${result}…`;
}

const coverDataUrlCache = new Map<string, string>();

/**
 * Retourne un artwork generatif en data URL (miniatures DOM du choix).
 * @param beat Beat source.
 * @param size Cote en pixels de la miniature.
 */
export function coverDataUrl(beat: Pick<LandingBeat, "id" | "genre" | "bpm">, size = 96) {
  const key = `${beat.id}:${size}`;
  const cached = coverDataUrlCache.get(key);

  if (cached) {
    return cached;
  }

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return "";
  }

  paintCoverArt(ctx, beat, 0, 0, size);
  const url = canvas.toDataURL("image/png");
  coverDataUrlCache.set(key, url);

  return url;
}
