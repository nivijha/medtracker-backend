import express from "express";
import request from "supertest";
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../services/llmGenerationService.js", () => ({
  generateText: vi.fn(),
}));

import aiRoutes from "../../routes/aiRoutes.js";
import { generateText } from "../../services/llmGenerationService.js";

describe("internal /api/ai/generate", () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use("/api/ai", aiRoutes);
    vi.clearAllMocks();
    delete process.env.RAG_SERVICE_SECRET;
  });

  it("returns generated text on 200", async () => {
    generateText.mockResolvedValue("Metformin 500 mg daily.");
    const res = await request(app)
      .post("/api/ai/generate")
      .send({ systemPrompt: "sys", userPrompt: "user" });
    expect(res.status).toBe(200);
    expect(res.body.text).toBe("Metformin 500 mg daily.");
    expect(generateText).toHaveBeenCalledWith("sys", "user");
  });

  it("400 when prompts missing", async () => {
    const res = await request(app).post("/api/ai/generate").send({});
    expect(res.status).toBe(400);
  });

  it("403 when secret configured and missing", async () => {
    process.env.RAG_SERVICE_SECRET = "topsecret";
    const res = await request(app)
      .post("/api/ai/generate")
      .send({ systemPrompt: "s", userPrompt: "u" });
    expect(res.status).toBe(403);
  });

  it("200 when secret matches", async () => {
    process.env.RAG_SERVICE_SECRET = "topsecret";
    generateText.mockResolvedValue("ok");
    const res = await request(app)
      .post("/api/ai/generate")
      .set("x-rag-service-secret", "topsecret")
      .send({ systemPrompt: "s", userPrompt: "u" });
    expect(res.status).toBe(200);
  });
});
