import { describe, expect, it } from "vitest";

import {
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

describe("beat validation", () => {
  it("creates a normalized beat with a default basic license", () => {
    expect(
      parseCreateBeatInput({
        title: " First Beat ",
        priceAmount: "19.999",
        currency: "eur",
        tags: [" Trap ", "trap", " Drill "],
        bpm: "140",
        publish: true,
        audioAsset,
      }),
    ).toMatchObject({
      title: "First Beat",
      priceAmount: 20,
      currency: "EUR",
      tags: ["trap", "drill"],
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
          "https://example.com/beats?tags=Trap,Drill&sort=price_desc&limit=100&sellerSlug=prod&licenseType=basic",
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
      tags: ["trap", "drill"],
      licenseType: "BASIC",
      sort: "price_desc",
      limit: 50,
    });

    expect(parseUpdateBeatInput({ priceAmount: "12.345", status: "hidden" })).toEqual({
      priceAmount: 12.35,
      status: "HIDDEN",
    });
  });
});
