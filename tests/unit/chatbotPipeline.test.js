import { describe, it, expect } from "vitest";
import { extractDates, extractDatesWithContext, isDateOnlyFollowUp } from "../../utils/dateUtils.js";
import { looksLikeDocumentQuery, isFollowUp } from "../../utils/intentUtils.js";

describe("date extraction — single and multi-date", () => {
  it("parses 23rd July → YYYY-07-23", () => {
    const y = new Date().getFullYear();
    expect(extractDates("23rd July")).toContain(`${y}-07-23`);
  });

  it("parses July 23 → YYYY-07-23", () => {
    const y = new Date().getFullYear();
    expect(extractDates("July 23")).toContain(`${y}-07-23`);
  });

  it("parses July 23rd → YYYY-07-23", () => {
    const y = new Date().getFullYear();
    expect(extractDates("July 23rd")).toContain(`${y}-07-23`);
  });

  it("parses 13th July → YYYY-07-13", () => {
    const y = new Date().getFullYear();
    expect(extractDates("13th July")).toContain(`${y}-07-13`);
  });

  it("parses 13th and 23rd July → both dates", () => {
    const dates = extractDates("13th and 23rd July");
    expect(dates.length).toBeGreaterThanOrEqual(2);
  });

  it("parses July 13 and July 23 → both dates", () => {
    const dates = extractDates("July 13 and July 23");
    expect(dates.length).toBeGreaterThanOrEqual(2);
  });

  it("parses my July 23 report → July 23", () => {
    const y = new Date().getFullYear();
    expect(extractDates("my July 23 report")).toContain(`${y}-07-23`);
  });

  it("parses report from 13th July → July 13", () => {
    const y = new Date().getFullYear();
    expect(extractDates("report from 13th July")).toContain(`${y}-07-13`);
  });

  it("parses reports from 13th and 23rd July → both", () => {
    const dates = extractDates("reports from 13th and 23rd July");
    expect(dates.length).toBeGreaterThanOrEqual(2);
  });

  it("parses ISO 2026-07-13", () => {
    expect(extractDates("2026-07-13")).toContain("2026-07-13");
  });
});

describe("date follow-up context", () => {
  it("for 23rd july? inherits via previous", () => {
    const dates = extractDatesWithContext("for 23rd july?", "what does my July report tell me?");
    expect(dates.length).toBeGreaterThanOrEqual(1);
  });

  it("isDateOnlyFollowUp detects short date follow-ups", () => {
    expect(isDateOnlyFollowUp("for 23rd july?")).toBe(true);
    expect(isDateOnlyFollowUp("for July 13?")).toBe(true);
    expect(isDateOnlyFollowUp("what does my 23rd july report tell me about my health?")).toBe(false);
  });
});

describe("document_query intent detection", () => {
  const docQueries = [
    "what does my report say",
    "what does my 23rd july report say",
    "what is the health for my 13th july report",
    "tell me about my report",
    "compare my 13th and 23rd july reports",
    "what changed between my reports",
    "what are my values on 13th and 23rd july",
    "how did my health change from 13th to 23rd july",
  ];

  for (const q of docQueries) {
    it(`"${q}" → document_query`, () => {
      expect(looksLikeDocumentQuery(q)).toBe(true);
    });
  }

  it("unrelated query is not document_query", () => {
    expect(looksLikeDocumentQuery("what is the weather today?")).toBe(false);
  });

  it("follow-up for 23rd july? is detected", () => {
    expect(isFollowUp("for 23rd july?", "what does my report tell me?")).toBe(true);
  });

  it("what about the 13th? is follow-up", () => {
    expect(isFollowUp("what about the 13th?", "what does my 23rd july report say?")).toBe(true);
  });
});
