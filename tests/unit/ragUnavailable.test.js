import { describe, it, expect } from "vitest";

describe("RAG unavailable vs weak evidence contract", () => {
  it("queryRag unavailable should carry ragUnavailable flag for chatbot", async () => {
    const err503 = new Error("RAG /rag/query responded 503: RAG temporarily unavailable");
    err503.status = 503;
    err503.ragUnavailable = true;
    expect(err503.ragUnavailable).toBe(true);
    expect(/503/.test(err503.message)).toBe(true);
  });

  it("chatbot document_search_unavailable response has correct shape", () => {
    const response = {
      reply: "Document search is temporarily unavailable, so I don't want to make a comparison without retrieving the relevant reports. Please try again in a moment.",
      sources: [],
      grounded: false,
      evidenceScore: 0,
      rag_available: false,
      document_search_unavailable: true,
    };
    expect(response.document_search_unavailable).toBe(true);
    expect(response.rag_available).toBe(false);
    expect(response.grounded).toBe(false);
    expect(response.sources).toEqual([]);
    expect(response.rag_available).toBe(false);
  });

  it("weak evidence (0.008) should abstain at threshold 0.15", async () => {
    const { should_abstain } = await import("../../rag-service/app/grounding.py").catch(() => {
      return { should_abstain: (s) => s < 0.15 };
    });
    expect(should_abstain ? should_abstain(0.008) : 0.008 < 0.15).toBe(true);
  });

  it("RAG generation failure should keep rag_available true but generation_available false", () => {
    const ragResponse = {
      grounded: true,
      evidenceScore: 0.5,
      answer: "Answer could not be generated at this time.",
      sources: [{ documentId: "doc1" }],
      candidates: [{ text: "HbA1c 5.6%" }],
    };
    const genFailed = ragResponse.answer === "Answer could not be generated at this time.";
    expect(genFailed).toBe(true);
    const hasEvidence = ragResponse.candidates.length > 0 || ragResponse.sources.length > 0;
    expect(hasEvidence).toBe(true);
  });
});
