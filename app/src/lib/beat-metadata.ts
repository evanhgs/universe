import {
  MainGenres,
  Moods,
  SecondGenres,
  Tags,
  UsageTags,
  type MainGenres as MainGenre,
  type Moods as Mood,
  type SecondGenres as SecondGenre,
  type Tags as Tag,
  type UsageTags as UsageTag,
} from "../../generated/prisma/enums";

export type { MainGenre, Mood, SecondGenre, Tag, UsageTag };

export const MAIN_GENRES = Object.values(MainGenres);
export const SECOND_GENRES = Object.values(SecondGenres);
export const MOODS = Object.values(Moods);
export const BEAT_TAGS = Object.values(Tags);
export const USAGE_TAGS = Object.values(UsageTags);

export const BEAT_METADATA_LIMITS = {
  mainGenres: 3,
  secondGenres: 5,
  moods: 3,
  tags: 12,
  usageTags: 8,
} as const;

const rapSecondGenres = [
  "TRAP",
  "DARK_TRAP",
  "MELODIC_TRAP",
  "PLUGGNB",
  "DRILL",
  "UK_DRILL",
  "NY_DRILL",
  "BOOM_BAP",
  "OLD_SCHOOL",
  "WEST_COAST",
  "EAST_COAST",
  "CLOUD_RAP",
  "LO_FI_RAP",
  "EMO_RAP",
  "RAGE",
  "JERK",
  "PLUGG",
  "PHONK",
  "MEMPHIS_RAP",
  "JERSEY_CLUB_RAP",
  "GRIME",
  "RAP_CONSCIENT",
  "FREESTYLE_BEAT",
] as const satisfies SecondGenre[];

const popSecondGenres = [
  "R_AND_B_MODERNE",
  "ALTERNATIVE_R_AND_B",
  "TRAP_SOUL",
  "NEO_SOUL",
  "POP_RAP",
  "POP_URBAINE",
  "INDIE_POP",
  "SYNTH_POP",
  "DARK_POP",
  "AFRO_POP",
  "LATIN_POP",
  "K_POP_STYLE",
  "J_POP_STYLE",
] as const satisfies SecondGenre[];

const afroLatinSecondGenres = [
  "AFROBEATS",
  "AFROTRAP",
  "AMAPIANO",
  "KIZOMBA",
  "ZOUK",
  "DANCEHALL",
  "REGGAETON",
  "DEMBOW",
  "BAILE_FUNK",
  "MOOMBAHTON",
  "SOCA",
  "KOMPA",
] as const satisfies SecondGenre[];

const electronicSecondGenres = [
  "HOUSE",
  "DEEP_HOUSE",
  "TECH_HOUSE",
  "AFRO_HOUSE",
  "FUTURE_HOUSE",
  "TECHNO",
  "MELODIC_TECHNO",
  "TRANCE",
  "DUBSTEP",
  "DRUM_AND_BASS",
  "GARAGE",
  "UK_GARAGE",
  "JUNGLE",
  "HARDSTYLE",
  "SYNTHWAVE",
  "CHILLWAVE",
  "AMBIENT_ELECTRONIC",
] as const satisfies SecondGenre[];

export const SECOND_GENRES_BY_MAIN_GENRE = {
  RAP: rapSecondGenres,
  HIP_HOP: rapSecondGenres,
  DRILL: rapSecondGenres,
  TRAP: rapSecondGenres,
  BOOM_BAP: rapSecondGenres,
  LO_FI: rapSecondGenres,
  PHONK: rapSecondGenres,
  GRIME: rapSecondGenres,
  JERSEY_CLUB: rapSecondGenres,
  R_AND_B: popSecondGenres,
  POP: popSecondGenres,
  SOUL: popSecondGenres,
  FUNK: popSecondGenres,
  K_POP_J_POP: popSecondGenres,
  HYPERPOP: popSecondGenres,
  AFRO: afroLatinSecondGenres,
  DANCEHALL: afroLatinSecondGenres,
  REGGAETON: afroLatinSecondGenres,
  LATIN: afroLatinSecondGenres,
  AMAPIANO: afroLatinSecondGenres,
  ELECTRONIC_EDM: electronicSecondGenres,
  HOUSE: electronicSecondGenres,
  TECHNO: electronicSecondGenres,
  DUBSTEP: electronicSecondGenres,
  DRUM_AND_BASS: electronicSecondGenres,
  UK_GARAGE: electronicSecondGenres,
  AMBIENT: electronicSecondGenres,
  CINEMATIC_TRAILER: electronicSecondGenres,
  JAZZ: [...popSecondGenres, ...rapSecondGenres],
  ROCK: popSecondGenres,
  ALTERNATIVE: popSecondGenres,
  GOSPEL: popSecondGenres,
  EXPERIMENTAL: [...electronicSecondGenres, ...rapSecondGenres, ...popSecondGenres],
} as const satisfies Record<MainGenre, readonly SecondGenre[]>;

export function labelForBeatMetadata(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => (part.length <= 3 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1)))
    .join(" ");
}

export function secondGenresForMainGenres(mainGenres: readonly MainGenre[]) {
  return Array.from(
    new Set(mainGenres.flatMap((genre) => SECOND_GENRES_BY_MAIN_GENRE[genre] ?? [])),
  );
}
