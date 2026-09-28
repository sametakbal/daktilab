import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { fetchTestWords } from "./testWords";

const clientReturning = (result: unknown) => ({ rpc: vi.fn().mockResolvedValue(result) }) as unknown as SupabaseClient;

describe("fetchTestWords", () => {
  it("returns null without a Supabase client", async () => {
    expect(await fetchTestWords("tr", 10, null)).toBeNull();
  });

  it("calls random_words and returns its rows", async () => {
    const client = clientReturning({ data: ["ev", "su"], error: null });
    expect(await fetchTestWords("tr", 10, client)).toEqual(["ev", "su"]);
    expect(client.rpc).toHaveBeenCalledWith("random_words", { p_lang: "tr", p_count: 10 });
  });

  it("returns null on errors or empty results", async () => {
    expect(await fetchTestWords("en", 10, clientReturning({ data: null, error: { message: "404" } }))).toBeNull();
    expect(await fetchTestWords("en", 10, clientReturning({ data: [], error: null }))).toBeNull();
    const throwing = { rpc: vi.fn().mockRejectedValue(new Error("offline")) } as unknown as SupabaseClient;
    expect(await fetchTestWords("en", 10, throwing)).toBeNull();
  });
});
