import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import mongoose from "mongoose";
import { connectTestDB, disconnectTestDB, clearCollections } from "../helpers/db.js";
import Report from "../../models/Report.js";
import User from "../../models/User.js";

const makeUser = async () => {
  const u = await User.create({ name: "Tester", email: `t${Date.now()}${Math.random()}@test.com`, password: "password123" });
  return u;
};

describe("RAG indexing status", () => {
  beforeAll(async () => { await connectTestDB(); });
  afterAll(async () => { await disconnectTestDB(); });
  beforeEach(async () => { await clearCollections(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("successful indexing: PENDING -> INDEXED", async () => {
    const user = await makeUser();
    const report = await Report.create({ user: user._id, type: "lab", fileUrl: "https://res.cloudinary.com/demo/raw/upload/v1/medtracker/reports/a.pdf", cloudinaryId: "medtracker/reports/a", reportDate: new Date("2026-07-13"), ragIndexed: "PENDING" });
    const pdfBuf = Buffer.from("%PDF-1.4 hello world");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => pdfBuf })));
    const { extractTextFromPdf } = await import("../../services/pdfExtractionService.js");
    vi.spyOn(await import("../../services/pdfExtractionService.js"), "extractTextFromPdf").mockResolvedValue("hemoglobin 14 g/dL");
    const { isPdfBuffer } = await import("../../services/pdfExtractionService.js");
    const rc = await import("../../services/ragClient.js");
    vi.spyOn(rc, "indexDocument").mockResolvedValue({ ok: true, data: { chunkCount: 2 } });
    const { indexReportById } = await import("../../controllers/ragController.js");
    await indexReportById(report._id, user._id.toString());
    const updated = await Report.findById(report._id).lean();
    expect(updated.ragIndexed).toBe("INDEXED");
    expect(updated.ragIndexError).toBeNull();
  });

  it("failed indexing: PENDING -> FAILED with sanitized error", async () => {
    const user = await makeUser();
    const report = await Report.create({ user: user._id, type: "lab", fileUrl: "https://res.cloudinary.com/demo/raw/upload/v1/medtracker/reports/b.pdf", cloudinaryId: "medtracker/reports/b", reportDate: new Date("2026-07-13") });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));
    const rc = await import("../../services/ragClient.js");
    vi.spyOn(rc, "indexDocument").mockResolvedValue({ ok: false, error: "RAG https://secret.url responded 429: https://internal" });
    const { indexReportById } = await import("../../controllers/ragController.js");
    await indexReportById(report._id, user._id.toString());
    const updated = await Report.findById(report._id).lean();
    expect(updated.ragIndexed).toBe("FAILED");
    expect(updated.ragIndexError).toBeDefined();
    expect(String(updated.ragIndexError)).not.toContain("https://");
  });

  it("successful retry: FAILED -> PENDING -> INDEXED", async () => {
    const user = await makeUser();
    const report = await Report.create({ user: user._id, type: "lab", fileUrl: "https://res.cloudinary.com/demo/raw/upload/v1/medtracker/reports/c.pdf", cloudinaryId: "medtracker/reports/c", reportDate: new Date("2026-07-23"), ragIndexed: "FAILED", ragIndexError: "old" });
    const pdfBuf = Buffer.from("%PDF-1.4 ok");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => pdfBuf })));
    const rc2 = await import("../../services/ragClient.js");
    vi.spyOn(rc2, "indexDocument").mockResolvedValue({ ok: true, data: { chunkCount: 1 } });
    vi.spyOn(await import("../../services/pdfExtractionService.js"), "extractTextFromPdf").mockResolvedValue("text");
    const { indexReportById } = await import("../../controllers/ragController.js");
    await indexReportById(report._id, user._id.toString());
    const updated = await Report.findById(report._id).lean();
    expect(updated.ragIndexed).toBe("INDEXED");
    expect(updated.ragIndexError).toBeNull();
  });

  it("cloudinary fallback: primary 404 alternate succeeds", async () => {
    const user = await makeUser();
    const report = await Report.create({ user: user._id, type: "lab", fileUrl: "https://res.cloudinary.com/demo/raw/upload/v1/medtracker/reports/d.pdf", cloudinaryId: "medtracker/reports/d", reportDate: new Date("2026-07-13") });
    const pdfBuf = Buffer.from("%PDF-1.4 fallback ok");
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes("/raw/upload/")) return { ok: false, status: 404 };
      return { ok: true, arrayBuffer: async () => pdfBuf };
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(await import("../../services/pdfExtractionService.js"), "extractTextFromPdf").mockResolvedValue("fallback text");
    const rc3 = await import("../../services/ragClient.js");
    vi.spyOn(rc3, "indexDocument").mockResolvedValue({ ok: true, data: { chunkCount: 1 } });
    const { indexReportById } = await import("../../controllers/ragController.js");
    await indexReportById(report._id, user._id.toString());
    const updated = await Report.findById(report._id).lean();
    expect(updated.ragIndexed).toBe("INDEXED");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("both URLs fail -> FAILED without leaking URL", async () => {
    const user = await makeUser();
    const report = await Report.create({ user: user._id, type: "lab", fileUrl: "https://res.cloudinary.com/demo/raw/upload/v1/medtracker/reports/e.pdf", cloudinaryId: "medtracker/reports/e", reportDate: new Date("2026-07-13") });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));
    const { indexReportById } = await import("../../controllers/ragController.js");
    await indexReportById(report._id, user._id.toString());
    const updated = await Report.findById(report._id).lean();
    expect(updated.ragIndexed).toBe("FAILED");
    expect(String(updated.ragIndexError || "")).not.toContain("cloudinary");
    expect(String(updated.ragIndexError || "")).not.toContain("https://");
  });

  it("authorization: user cannot reindex another user report", async () => {
    const u1 = await makeUser(); const u2 = await makeUser();
    const report = await Report.create({ user: u1._id, type: "lab", fileUrl: "https://res.cloudinary.com/demo/raw/upload/v1/x.pdf", cloudinaryId: "x", reportDate: new Date() });
    const { indexReport } = await import("../../controllers/ragController.js");
    const req = { body: { reportId: report._id.toString() }, user: { id: u2._id.toString() } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await indexReport(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("idempotency: reindex same document_id preserves single logical doc via ragIndexed transitions", async () => {
    const user = await makeUser();
    const report = await Report.create({ user: user._id, type: "lab", fileUrl: "https://res.cloudinary.com/demo/raw/upload/v1/medtracker/reports/f.pdf", cloudinaryId: "medtracker/reports/f", reportDate: new Date("2026-07-13") });
    const pdfBuf = Buffer.from("%PDF-1.4 idempotent");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => pdfBuf })));
    vi.spyOn(await import("../../services/pdfExtractionService.js"), "extractTextFromPdf").mockResolvedValue("again");
    const rc4 = await import("../../services/ragClient.js");
    const spy = vi.spyOn(rc4, "indexDocument").mockResolvedValue({ ok: true, data: { chunkCount: 1 } });
    const { indexReportById } = await import("../../controllers/ragController.js");
    await indexReportById(report._id, user._id.toString());
    await indexReportById(report._id, user._id.toString());
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(1, expect.objectContaining({ documentId: report._id.toString() }));
    expect(spy).toHaveBeenNthCalledWith(2, expect.objectContaining({ documentId: report._id.toString() }));
    const updated = await Report.findById(report._id).lean();
    expect(updated.ragIndexed).toBe("INDEXED");
  });
});
