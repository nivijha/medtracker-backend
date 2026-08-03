import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../config/llama_summary.js", () => ({
  generateReportSummary: vi.fn(),
}));

vi.mock("../../config/gemini.js", () => ({
  generateGeminiSummary: vi.fn(),
}));

vi.mock("../../utils/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { generateReportSummary } from "../../services/reportSummaryService.js";
import { generateReportSummary as llamaSummary } from "../../config/llama_summary.js";
import { generateGeminiSummary } from "../../config/gemini.js";

describe("reportSummaryService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the LLaMA summary when LLaMA succeeds", async () => {
    llamaSummary.mockResolvedValue("llama summary");
    const result = await generateReportSummary("some text");
    expect(result).toBe("llama summary");
    expect(generateGeminiSummary).not.toHaveBeenCalled();
  });

  it("falls back to Gemini when LLaMA fails", async () => {
    llamaSummary.mockRejectedValue(new Error("HF provider down"));
    generateGeminiSummary.mockResolvedValue("gemini summary");

    const result = await generateReportSummary("some text");

    expect(result).toBe("gemini summary");
    expect(generateGeminiSummary).toHaveBeenCalledTimes(1);
  });

  it("throws a clean error when both providers fail", async () => {
    llamaSummary.mockRejectedValue(new Error("HF provider down"));
    generateGeminiSummary.mockRejectedValue(new Error("Gemini down"));

    await expect(generateReportSummary("some text")).rejects.toThrow(
      "Failed to generate AI summary from document."
    );
  });
});
