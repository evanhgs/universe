-- Align beat metadata with enum-backed arrays used by upload, catalog and feed scoring.

ALTER TYPE "ModerationStatus" ADD VALUE IF NOT EXISTS 'RESTRICTED';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'ReviewTargetType' AND e.enumlabel = 'SELLER'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'ReviewTargetType' AND e.enumlabel = 'CERTIFIED_SELLER'
  ) THEN
    ALTER TYPE "ReviewTargetType" RENAME VALUE 'SELLER' TO 'CERTIFIED_SELLER';
  END IF;
END $$;

CREATE TYPE "MainGenres" AS ENUM (
  'RAP',
  'HIP_HOP',
  'R_AND_B',
  'POP',
  'AFRO',
  'DANCEHALL',
  'REGGAETON',
  'ELECTRONIC_EDM',
  'HOUSE',
  'TECHNO',
  'DRILL',
  'TRAP',
  'BOOM_BAP',
  'LO_FI',
  'SOUL',
  'FUNK',
  'JAZZ',
  'ROCK',
  'ALTERNATIVE',
  'LATIN',
  'K_POP_J_POP',
  'GOSPEL',
  'CINEMATIC_TRAILER',
  'AMBIENT',
  'PHONK',
  'HYPERPOP',
  'JERSEY_CLUB',
  'AMAPIANO',
  'UK_GARAGE',
  'GRIME',
  'DUBSTEP',
  'DRUM_AND_BASS',
  'EXPERIMENTAL'
);

CREATE TYPE "SecondGenres" AS ENUM (
  'TRAP',
  'DARK_TRAP',
  'MELODIC_TRAP',
  'PLUGGNB',
  'DRILL',
  'UK_DRILL',
  'NY_DRILL',
  'BOOM_BAP',
  'OLD_SCHOOL',
  'WEST_COAST',
  'EAST_COAST',
  'CLOUD_RAP',
  'LO_FI_RAP',
  'EMO_RAP',
  'RAGE',
  'JERK',
  'PLUGG',
  'PHONK',
  'MEMPHIS_RAP',
  'JERSEY_CLUB_RAP',
  'GRIME',
  'RAP_CONSCIENT',
  'FREESTYLE_BEAT',
  'R_AND_B_MODERNE',
  'ALTERNATIVE_R_AND_B',
  'TRAP_SOUL',
  'NEO_SOUL',
  'POP_RAP',
  'POP_URBAINE',
  'INDIE_POP',
  'SYNTH_POP',
  'DARK_POP',
  'AFRO_POP',
  'LATIN_POP',
  'K_POP_STYLE',
  'J_POP_STYLE',
  'AFROBEATS',
  'AFROTRAP',
  'AMAPIANO',
  'KIZOMBA',
  'ZOUK',
  'DANCEHALL',
  'REGGAETON',
  'DEMBOW',
  'BAILE_FUNK',
  'MOOMBAHTON',
  'SOCA',
  'KOMPA',
  'HOUSE',
  'DEEP_HOUSE',
  'TECH_HOUSE',
  'AFRO_HOUSE',
  'FUTURE_HOUSE',
  'TECHNO',
  'MELODIC_TECHNO',
  'TRANCE',
  'DUBSTEP',
  'DRUM_AND_BASS',
  'GARAGE',
  'UK_GARAGE',
  'JUNGLE',
  'HARDSTYLE',
  'SYNTHWAVE',
  'CHILLWAVE',
  'AMBIENT_ELECTRONIC'
);

CREATE TYPE "Moods" AS ENUM (
  'DARK',
  'SAD',
  'MELOANCHOLIC',
  'EMOTIONAL',
  'ROMANTIC',
  'CHILL',
  'SMOOTH',
  'DREAMY',
  'ENERGETIC',
  'AGGRESSIVE',
  'EPIC',
  'CINEMATIC',
  'HAPPY',
  'SUMMER',
  'NOSTALGIC',
  'LUXURY',
  'SEXY',
  'SPIRITUAL',
  'MOTIVATIONAL',
  'INSPIRATIONAL',
  'ANGRY',
  'MYSTERIOUS',
  'MINIMAL',
  'BOUNCY',
  'HARD',
  'SOFT',
  'COLD',
  'WARM',
  'EUPHORIC',
  'HYPNOTIC',
  'STREET',
  'GANGSTA',
  'CLUB',
  'UNDERGROUND',
  'EXPERIMENTAL',
  'VINTAGE',
  'FUTURISTIC'
);

CREATE TYPE "Tags" AS ENUM (
  'INSTRUMENTS_808',
  'KICK',
  'SNARE',
  'CLAP',
  'HI_HATS',
  'OPEN_HAT',
  'PIANO',
  'GUITAR',
  'ELECTRIC_GUITAR',
  'ACOUSTIC_GUITAR',
  'STRINGS',
  'VIOLIN',
  'BRASS',
  'CHOIR',
  'SYNTH',
  'PAD',
  'PLUCK',
  'BELL',
  'FLUTE',
  'SAXOPHONE',
  'BASS',
  'SUB_BASS',
  'ORGAN',
  'RHODES',
  'MALLETS',
  'ETHNIC_INSTRUMENTS',
  'VOCAL_CHOPS',
  'SAMPLE',
  'BOUNCY',
  'SWING',
  'STRAIGHT',
  'SYNCOPATED',
  'GROOVY',
  'MINIMAL_DRUMS',
  'HEAVY_DRUMS',
  'FAST_HI_HATS',
  'DRILL_BOUNCE',
  'TRAP_BOUNCE',
  'FOUR_ON_THE_FLOOR',
  'SHUFFLE',
  'HALF_TIME',
  'DOUBLE_TIME',
  'CLEAN',
  'DIRTY',
  'DISTORTED',
  'WARM',
  'ANALOG',
  'LO_FI',
  'WIDE',
  'AMBIENT',
  'REVERB_HEAVY',
  'DRY',
  'PUNCHY',
  'SOFT',
  'CRISP',
  'VINTAGE',
  'FUTURISTIC'
);

CREATE TYPE "UsageTags" AS ENUM (
  'FREESTYLE',
  'STORYTELLING',
  'CLUB',
  'RADIO',
  'SAD_SONG',
  'LOVE_SONG',
  'DRILL_SONG',
  'TRAP_BANGER',
  'MELODIC_RAP',
  'STREET_RAP',
  'COMMERCIAL',
  'INTRO',
  'OUTRO',
  'TYPE_BEAT',
  'SYNC_LICENSING',
  'YOUTUBE',
  'TIKTOK',
  'FILM',
  'TRAILER',
  'GAMING',
  'PODCAST',
  'ADVERTISING'
);

DROP INDEX IF EXISTS "Beat_primaryGenre_publishedAt_idx";

ALTER TABLE "Beat"
  ADD COLUMN "mainGenres" "MainGenres"[] NOT NULL DEFAULT ARRAY[]::"MainGenres"[],
  ADD COLUMN "secondGenres" "SecondGenres"[] NOT NULL DEFAULT ARRAY[]::"SecondGenres"[],
  ADD COLUMN "moods" "Moods"[] NOT NULL DEFAULT ARRAY[]::"Moods"[],
  ADD COLUMN "usageTags" "UsageTags"[] NOT NULL DEFAULT ARRAY[]::"UsageTags"[],
  ADD COLUMN "bpmFeel" TEXT;

ALTER TABLE "Beat"
  ALTER COLUMN "tags" TYPE "Tags"[] USING ARRAY[]::"Tags"[],
  ALTER COLUMN "tags" SET DEFAULT ARRAY[]::"Tags"[],
  ALTER COLUMN "tags" SET NOT NULL;

UPDATE "Beat"
SET "mainGenres" = ARRAY[UPPER("primaryGenre")::"MainGenres"]
WHERE "primaryGenre" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM unnest(enum_range(NULL::"MainGenres")) AS genre
    WHERE genre::text = UPPER("Beat"."primaryGenre")
  );

UPDATE "Beat"
SET "moods" = ARRAY[UPPER("primaryMood")::"Moods"]
WHERE "primaryMood" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM unnest(enum_range(NULL::"Moods")) AS mood
    WHERE mood::text = UPPER("Beat"."primaryMood")
  );

ALTER TABLE "Beat"
  DROP COLUMN IF EXISTS "primaryGenre",
  DROP COLUMN IF EXISTS "primaryMood";

CREATE INDEX "Beat_status_visibility_moderationStatus_publishedAt_idx"
  ON "Beat"("status", "visibility", "moderationStatus", "publishedAt");
