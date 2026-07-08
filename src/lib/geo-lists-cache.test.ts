import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/client-fetch", () => ({
  fetchWithTimeout: vi.fn(),
}));

import { fetchWithTimeout } from "@/lib/client-fetch";
import {
  clearGeoListsCacheForTests,
  getMunicipalitiesCached,
  getToponymsCached,
  peekMunicipalities,
  peekToponyms,
  seedMunicipalitiesCache,
  seedToponymsCache,
} from "@/lib/geo-lists-cache";

const fetchMock = vi.mocked(fetchWithTimeout);

function jsonResponse(data: unknown, ok = true): Response {
  return {
    ok,
    json: async () => data,
  } as Response;
}

describe("geo-lists-cache", () => {
  beforeEach(() => {
    clearGeoListsCacheForTests();
    fetchMock.mockReset();
  });

  it("fetches municipalities once and reuses cache", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(["Αγρίνιο", "Μεσολόγγι"]));

    const a = await getMunicipalitiesCached();
    const b = await getMunicipalitiesCached();

    expect(a).toEqual(["Αγρίνιο", "Μεσολόγγι"]);
    expect(b).toEqual(["Αγρίνιο", "Μεσολόγγι"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(peekMunicipalities()).toEqual(["Αγρίνιο", "Μεσολόγγι"]);
  });

  it("dedupes concurrent municipality fetches", async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((r) => {
        resolve = r;
      }),
    );

    const p1 = getMunicipalitiesCached();
    const p2 = getMunicipalitiesCached();
    resolve(jsonResponse(["Ναύπακτος"]));

    await expect(Promise.all([p1, p2])).resolves.toEqual([["Ναύπακτος"], ["Ναύπακτος"]]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("normalizes toponym rows and seeds for peek", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        { id: "1", name: "  Κάτω Χώρα  " },
        { id: "2", name: "α" },
        { id: "3", name: "Άνω Κώμη" },
      ]),
    );

    const rows = await getToponymsCached();
    expect(rows.map((t) => t.name)).toEqual(["Κάτω Χώρα", "Άνω Κώμη"]);
    expect(peekToponyms()?.map((t) => t.name)).toEqual(["Κάτω Χώρα", "Άνω Κώμη"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await getToponymsCached();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("seed helpers warm cache without fetch", async () => {
    seedMunicipalitiesCache(["Θέρμο"]);
    seedToponymsCache([{ id: "x", name: "Σταμνά" }]);

    expect(peekMunicipalities()).toEqual(["Θέρμο"]);
    expect(peekToponyms()?.[0]?.name).toBe("Σταμνά");
    expect(await getMunicipalitiesCached()).toEqual(["Θέρμο"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
