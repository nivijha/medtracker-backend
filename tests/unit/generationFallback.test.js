import { describe, it, expect, vi } from "vitest";

vi.mock("../../config/gemini.js", () => ({
  generateGeminiText: vi.fn(),
  generateGeminiSummary: vi.fn(),
}));

vi.mock("../../config/llama_chat.js", () => ({
  default: vi.fn(() => ({
    chat: { completions: { create: vi.fn() } },
  })),
}));

import { generateGeminiText } from "../../config/gemini.js";
import getLlamaClient from "../../config/llama_chat.js";
import { generateText } from "../../services/llmGenerationService.js";

describe("llmGenerationService — provider fallback", () => {
  it("falls back to NVIDIA when Gemini throws 503", async () => {
    const err503 = Object.assign(new Error("503 This model is currently experiencing high demand"), { status: 503 });
    vi.mocked(generateGeminiText).mockRejectedValueOnce(err503);
    const mockCreate = vi.fn().mockResolvedValue({ choices: [{ message: { content: "NVIDIA fallback answer" } }] });
    vi.mocked(getLlamaClient).mockReturnValue({ chat: { completions: { create: mockCreate } } });

    const result = await generateText("sys", "user query about reports");
    expect(result).toBe("NVIDIA fallback answer");
    expect(generateGeminiText).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("throws controlled error when both providers fail", async () => {
    vi.mocked(generateGeminiText).mockRejectedValueOnce(new Error("503 overloaded"));
    const mockCreate = vi.fn().mockRejectedValue(new Error("NVIDIA down"));
    vi.mocked(getLlamaClient).mockReturnValue({ chat: { completions: { create: mockCreate } } });

    await expect(generateText("sys", "user")).rejects.toThrow(/Failed to generate/);
  });

  it("does not fabricate when Gemini timeout triggers fallback", async () => {
    const timeoutErr = Object.assign(new Error("Gemini timeout after 15000ms"), { status: 504 });
    vi.mocked(generateGeminiText).mockRejectedValueOnce(timeoutErr);
    vi.mocked(getLlamaClient).mockReturnValue({
      chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [{ message: { content: "recovered answer" } }] }) } },
    });

    const result = await generateText("sys", "q");
    expect(result).toBe("recovered answer");
  });
});
