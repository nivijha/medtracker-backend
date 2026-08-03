import { describe, it, expect, vi, beforeEach } from "vitest";

const { getFromRedis, setInRedis, deleteFromRedis } = vi.hoisted(() => ({
  getFromRedis: vi.fn(),
  setInRedis: vi.fn(),
  deleteFromRedis: vi.fn(),
}));

vi.mock("../../config/redis.js", () => ({
  getFromRedis,
  setInRedis,
  deleteFromRedis,
}));

import {
  getSummaryFromRedis,
  setSummaryInRedis,
  deleteSummaryFromRedis,
} from "../../services/summaryCacheService.js";

describe("summaryCacheService", () => {
  const SUMMARY_TTL_SECONDS = 30 * 24 * 60 * 60;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores the summary under a namespaced key with a 30-day TTL", async () => {
    await setSummaryInRedis("abc123", "summary text");

    expect(setInRedis).toHaveBeenCalledTimes(1);
    const [key, value, ttl] = setInRedis.mock.calls[0];
    expect(key).toBe("report:summary:abc123");
    expect(ttl).toBe(SUMMARY_TTL_SECONDS);
    expect(JSON.parse(value).summary).toBe("summary text");
  });

  it("returns a parsed cached summary on hit", async () => {
    getFromRedis.mockResolvedValue(JSON.stringify({ summary: "cached summary" }));

    const result = await getSummaryFromRedis("abc123");

    expect(result).toBe("cached summary");
    expect(getFromRedis).toHaveBeenCalledWith("report:summary:abc123");
  });

  it("returns the raw value when the cached payload is not JSON", async () => {
    getFromRedis.mockResolvedValue("plain text");

    const result = await getSummaryFromRedis("abc123");

    expect(result).toBe("plain text");
  });

  it("returns null when there is no cached value", async () => {
    getFromRedis.mockResolvedValue(null);

    const result = await getSummaryFromRedis("abc123");

    expect(result).toBeNull();
  });

  it("deletes the summary key on invalidation", async () => {
    await deleteSummaryFromRedis("abc123");
    expect(deleteFromRedis).toHaveBeenCalledWith("report:summary:abc123");
  });
});
