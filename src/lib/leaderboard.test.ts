import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { finishRankedTest, startRankedTest } from "./leaderboard";

const clientReturning = (result: unknown) => ({ rpc: vi.fn().mockResolvedValue(result) }) as unknown as SupabaseClient;

describe("ranked test", () => {
  it("starts a run from the server's passage", async () => {
    const client = clientReturning({ data: [{ run_id: "r1", run_text: "ev su" }], error: null });
    expect(await startRankedTest("tr", "tr-q", client)).toEqual({ id: "r1", text: "ev su" });
    expect(client.rpc).toHaveBeenCalledWith("start_test", { p_lang: "tr", p_layout: "tr-q" });
  });

  it("returns null when the run can't be started", async () => {
    expect(await startRankedTest("tr", "tr-q", null)).toBeNull();
    expect(await startRankedTest("tr", "tr-q", clientReturning({ data: null, error: { message: "not signed in" } }))).toBeNull();
    expect(await startRankedTest("tr", "tr-q", clientReturning({ data: [], error: null }))).toBeNull();
  });

  it("sends the typed text and returns the server's score", async () => {
    const client = clientReturning({ data: 42, error: null });
    expect(await finishRankedTest("r1", "ev su", 97.5, client)).toBe(42);
    expect(client.rpc).toHaveBeenCalledWith("finish_test", { p_run: "r1", p_typed: "ev su", p_accuracy: 97.5 });
  });

  it("returns null when the server rejects the result", async () => {
    expect(await finishRankedTest("r1", "ev", 100, clientReturning({ data: null, error: { message: "test finished too early" } }))).toBeNull();
    const throwing = { rpc: vi.fn().mockRejectedValue(new Error("offline")) } as unknown as SupabaseClient;
    expect(await finishRankedTest("r1", "ev", 100, throwing)).toBeNull();
  });
});
