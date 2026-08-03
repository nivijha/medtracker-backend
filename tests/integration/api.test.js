import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";

vi.mock("../../services/reportSummaryService.js", () => ({
  generateReportSummary: vi.fn(() => Promise.resolve("Fake AI summary")),
}));

vi.mock("../../services/pdfExtractionService.js", () => ({
  extractTextFromPdf: vi.fn(async () => "Extracted sample text from PDF"),
  isPdfBuffer: vi.fn(() => true),
}));

vi.mock("../../utils/logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../config/cloudinary.js", () => ({
  default: {
    uploader: { destroy: vi.fn(async () => ({ result: "ok" })) },
  },
}));

import app from "../../index.js";
import User from "../../models/User.js";
import Report from "../../models/Report.js";
import {
  connectTestDB,
  disconnectTestDB,
  clearCollections,
} from "../helpers/db.js";
import { generateReportSummary } from "../../services/reportSummaryService.js";

const registerUser = async (email = "user@example.com") => {
  const res = await request(app).post("/api/auth/register").send({
    name: "Test User",
    email,
    phone: "9876543210",
    password: "secret1",
  });
  return res;
};

describe("Auth API", () => {
  beforeAll(connectTestDB);
  afterAll(disconnectTestDB);
  beforeEach(clearCollections);

  it("registers a user and returns a token", async () => {
    const res = await registerUser();
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe("user@example.com");
  });

  it("rejects a duplicate email with 409", async () => {
    await registerUser();
    const res = await registerUser();
    expect(res.status).toBe(409);
  });

  it("logs in with valid credentials", async () => {
    await registerUser("login@example.com");
    const res = await request(app).post("/api/auth/login").send({
      email: "login@example.com",
      password: "secret1",
    });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
  });

  it("rejects invalid credentials with 401", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: "login@example.com",
      password: "wrong",
    });
    expect(res.status).toBe(401);
  });

  it("returns the current user from /me", async () => {
    const reg = await registerUser("me@example.com");
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${reg.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe("me@example.com");
  });

  it("rejects /me without a token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });
});

describe("Medication API", () => {
  let token;

  beforeAll(connectTestDB);
  afterAll(disconnectTestDB);
  beforeEach(async () => {
    await clearCollections();
    const reg = await registerUser("med@example.com");
    token = reg.body.token;
  });

  it("creates and lists a medication", async () => {
    const createRes = await request(app)
      .post("/api/medications")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Paracetamol",
        dosage: "500mg",
        frequency: "2x daily",
        time: "08:00 AM",
        prescribedBy: "Dr. Mehta",
        startDate: new Date().toISOString(),
      });
    expect(createRes.status).toBe(201);

    const listRes = await request(app)
      .get("/api/medications")
      .set("Authorization", `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.medications).toHaveLength(1);
    expect(listRes.body.medications[0].name).toBe("Paracetamol");
  });

  it("deletes a medication", async () => {
    const created = await request(app)
      .post("/api/medications")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Amoxicillin",
        dosage: "250mg",
        frequency: "3x daily",
        time: "10:00 AM",
        prescribedBy: "Dr. Mehta",
        startDate: new Date().toISOString(),
      });
    const id = created.body.medication._id;

    const delRes = await request(app)
      .delete(`/api/medications/${id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(delRes.status).toBe(200);

    const listRes = await request(app)
      .get("/api/medications")
      .set("Authorization", `Bearer ${token}`);
    expect(listRes.body.medications).toHaveLength(0);
  });
});

describe("Appointment API", () => {
  let token;

  beforeAll(connectTestDB);
  afterAll(disconnectTestDB);
  beforeEach(async () => {
    await clearCollections();
    const reg = await registerUser("appt@example.com");
    token = reg.body.token;
  });

  it("creates and lists an appointment", async () => {
    const createRes = await request(app)
      .post("/api/appointments")
      .set("Authorization", `Bearer ${token}`)
      .send({ doctorName: "Dr. Sharma", date: "2026-08-10", time: "10:00" });
    expect(createRes.status).toBe(201);

    const listRes = await request(app)
      .get("/api/appointments")
      .set("Authorization", `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.appointments).toHaveLength(1);
    expect(listRes.body.appointments[0].doctorName).toBe("Dr. Sharma");
  });

  it("cancels an appointment", async () => {
    const created = await request(app)
      .post("/api/appointments")
      .set("Authorization", `Bearer ${token}`)
      .send({ doctorName: "Dr. Rao", date: "2026-08-11", time: "11:00" });
    const id = created.body.appointment._id;

    const cancelRes = await request(app)
      .put(`/api/appointments/${id}/cancel`)
      .set("Authorization", `Bearer ${token}`);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.appointment.status).toBe("cancelled");
  });
});

describe("Report analyze caching", () => {
  let token;
  let userId;
  let report;

  beforeAll(connectTestDB);
  afterAll(disconnectTestDB);
  beforeEach(async () => {
    await clearCollections();
    vi.clearAllMocks();
    const reg = await registerUser("report@example.com");
    token = reg.body.token;
    const user = await User.findOne({ email: "report@example.com" });
    userId = user._id.toString();
    report = await Report.create({
      user: userId,
      type: "lab",
      fileUrl: "https://example.com/report.pdf",
      cloudinaryId: "cloudinary-1",
      reportDate: new Date(),
    });
  });

  it("generates the summary once, persists it, and serves it from cache", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        arrayBuffer: async () => Buffer.from("%PDF-1.4 fake content"),
      }))
    );

    try {
      const first = await request(app)
        .get(`/api/reports/${report._id.toString()}/analyze`)
        .set("Authorization", `Bearer ${token}`);

      expect(first.status).toBe(200);
      expect(first.body.summary).toBe("Fake AI summary");
      expect(first.body.cached).toBe(false);
      expect(generateReportSummary).toHaveBeenCalledTimes(1);

      const stored = await Report.findById(report._id);
      expect(stored.summary).toBe("Fake AI summary");
      expect(stored.summaryGeneratedAt).toBeInstanceOf(Date);

      const second = await request(app)
        .get(`/api/reports/${report._id.toString()}/analyze`)
        .set("Authorization", `Bearer ${token}`);

      expect(second.status).toBe(200);
      expect(second.body.summary).toBe("Fake AI summary");
      expect(second.body.cached).toBe(true);
      expect(generateReportSummary).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("returns 403 for another user's report", async () => {
    const other = await registerUser("other@example.com");
    const res = await request(app)
      .get(`/api/reports/${report._id.toString()}/analyze`)
      .set("Authorization", `Bearer ${other.body.token}`);
    expect(res.status).toBe(403);
  });

  it("deletes the report and its cached summary", async () => {
    report.summary = "precomputed summary";
    report.summaryGeneratedAt = new Date();
    await report.save();

    const delRes = await request(app)
      .delete(`/api/reports/${report._id.toString()}`)
      .set("Authorization", `Bearer ${token}`);
    expect(delRes.status).toBe(200);

    const stillThere = await Report.findById(report._id);
    expect(stillThere).toBeNull();
  });
});
