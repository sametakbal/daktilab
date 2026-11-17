import { describe, expect, it, vi } from "vitest";
import { fetchTestWords } from "./testWords";

describe("fetchTestWords", () => {
  it("returns null without a backend", async () => {
    expect(await fetchTestWords("tr", 10, null)).toBeNull();
  });

  it("requests random words and returns them", async () => {
    const get = vi.fn().mockResolvedValue(["ev", "su"]);
    expect(await fetchTestWords("tr", 10, get)).toEqual(["ev", "su"]);
    expect(get).toHaveBeenCalledWith("/words?lang=tr&count=10");
  });

  it("returns null on errors or empty results", async () => {
    expect(await fetchTestWords("en", 10, vi.fn().mockResolvedValue({ error: "nope" }))).toBeNull();
    expect(await fetchTestWords("en", 10, vi.fn().mockResolvedValue([]))).toBeNull();
    expect(await fetchTestWords("en", 10, vi.fn().mockRejectedValue(new Error("offline")))).toBeNull();
  });
});
