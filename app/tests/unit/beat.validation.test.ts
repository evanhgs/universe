import { describe, expect, it } from "vitest";

import {
  parseBeatFeedQuery,
  parseBeatListQuery,
  parseCreateBeatInput,
  parseUpdateBeatInput,
} from "@/server/beats/beat.validation";

const audioAsset = {
  bucket: "beats",
  objectKey: "uploads/source.wav",
  originalFilename: "source.wav",
  mimeType: "audio/wav",
  extension: "wav",
  sizeBytes: 1024,
};
const thumbnailAsset = {
  bucket: "beats",
  objectKey: "uploads/thumb.webp",
  originalFilename: "thumb.webp",
  mimeType: "image/webp",
  extension: "webp",
  sizeBytes: 2048,
};

describe("beat validation", () => {
  it("creates a normalized beat with a default basic license", () => {
    expect(
      parseCreateBeatInput({
        title: " First Beat ",
        priceAmount: "19.999",
        currency: "eur",
        mainGenres: [" trap ", "DRILL"],
        secondGenres: ["DARK_TRAP"],
        moods: ["Dark", "ENERGETIC"],
        tags: [" Piano ", "PIANO", "SYNTH"],
        usageTags: ["type_beat"],
        bpm: "140",
        publish: true,
        audioAsset,
        thumbnailAsset,
      }),
    ).toMatchObject({
      title: "First Beat",
      priceAmount: 20,
      currency: "EUR",
      mainGenres: ["TRAP", "DRILL"],
      secondGenres: ["DARK_TRAP"],
      moods: ["DARK", "ENERGETIC"],
      tags: ["PIANO", "SYNTH"],
      usageTags: ["TYPE_BEAT"],
      bpm: 140,
      publish: true,
      isFree: false,
      brandingRequired: false,
      licenseOfferings: [
        {
          scope: "BASIC",
          title: "MP3",
          priceAmount: 20,
          currency: "EUR",
          isDefault: true,
          assets: [audioAsset],
        },
      ],
    });
  });

  it("enforces audio preview source and generated preview ownership", () => {
    expect(() =>
      parseCreateBeatInput({
        title: "Bad asset",
        priceAmount: 10,
        audioAsset: { ...audioAsset, mimeType: "application/pdf", extension: "pdf" },
      }),
    ).toThrow("audioAsset must be an MP3 or WAV file.");

    expect(() =>
      parseCreateBeatInput({
        title: "Manual preview",
        priceAmount: 10,
        audioAsset,
        previewAsset: audioAsset,
      }),
    ).toThrow("previewAsset is generated automatically.");
  });

  it("validates enum metadata limits and subgenre compatibility", () => {
    expect(() =>
      parseCreateBeatInput({
        title: "Too many genres",
        priceAmount: 10,
        audioAsset,
        mainGenres: ["TRAP", "DRILL", "POP", "AFRO"],
      }),
    ).toThrow("mainGenres cannot contain more than 3 values.");

    expect(() =>
      parseCreateBeatInput({
        title: "Bad metadata",
        priceAmount: 10,
        audioAsset,
        mainGenres: ["POP"],
        secondGenres: ["UK_DRILL"],
      }),
    ).toThrow("secondGenres contains a value incompatible with mainGenres.");

    expect(() =>
      parseCreateBeatInput({
        title: "Published without thumbnail",
        priceAmount: 10,
        publish: true,
        audioAsset,
        mainGenres: ["TRAP"],
      }),
    ).toThrow("thumbnailAsset is required to publish.");
  });

  it("validates explicit license offerings", () => {
    expect(() =>
      parseCreateBeatInput({
        title: "Duplicate licenses",
        priceAmount: 10,
        audioAsset,
        licenseOfferings: [
          { scope: "BASIC", priceAmount: 10, assets: [audioAsset] },
          { scope: "BASIC", priceAmount: 20, assets: [audioAsset] },
        ],
      }),
    ).toThrow("licenseOfferings cannot contain duplicate scopes.");

    expect(() =>
      parseCreateBeatInput({
        title: "Missing default source",
        priceAmount: 10,
        audioAsset,
        licenseOfferings: [
          {
            scope: "BASIC",
            priceAmount: 10,
            isDefault: true,
            assets: [{ ...audioAsset, objectKey: "other.wav" }],
          },
        ],
      }),
    ).toThrow("audioAsset must be attached to the default license offering.");
  });

  it("normalizes list query and update payloads", () => {
    expect(
      parseBeatListQuery(
        new URL(
          "https://example.com/beats?tags=Piano,Synth&sort=price_desc&limit=100&sellerSlug=prod&licenseType=basic",
        ),
      ),
    ).toEqual({
      search: undefined,
      genre: undefined,
      mood: undefined,
      bpm: undefined,
      bpmMin: undefined,
      bpmMax: undefined,
      key: undefined,
      priceMin: undefined,
      priceMax: undefined,
      producer: undefined,
      sellerSlug: "prod",
      tags: ["PIANO", "SYNTH"],
      licenseType: "BASIC",
      sort: "price_desc",
      limit: 50,
    });

    expect(parseUpdateBeatInput({ priceAmount: "12.345", status: "hidden" })).toEqual({
      priceAmount: 12.35,
      status: "HIDDEN",
    });
  });

  it("normalizes feed pagination queries", () => {
    const cursor = Buffer.from(
      JSON.stringify({ publishedAt: "2026-05-31T12:00:00.000Z", id: "beat_123" }),
      "utf8",
    ).toString("base64url");

    expect(parseBeatFeedQuery(new URL(`https://example.com/api/feed?limit=50&cursor=${cursor}`)))
      .toEqual({
        limit: 20,
        cursor: {
          publishedAt: "2026-05-31T12:00:00.000Z",
          id: "beat_123",
        },
      });

    expect(parseBeatFeedQuery(new URL("https://example.com/api/feed"))).toEqual({
      limit: 10,
      cursor: undefined,
    });

    expect(() =>
      parseBeatFeedQuery(new URL("https://example.com/api/feed?cursor=not-a-cursor")),
    ).toThrow("feed_cursor_invalid");
  });
});
