import Report from "../models/Report.js";
import { extractTextFromPdf, isPdfBuffer } from "../services/pdfExtractionService.js";
import { indexDocument } from "../services/ragClient.js";
import logger from "../utils/logger.js";

const NOISE_RE = /^(\[:|LPL[-\s].*LAB|DMC\s*-\s*\d+|IMPORTANT INSTRUCTIONS|CGHS|Test conducted|Page\s*\d+)/i;

async function fetchReportFileDual(fileUrl) {
  const urlsToTry = [fileUrl];
  if (fileUrl.includes("/raw/upload/")) urlsToTry.push(fileUrl.replace("/raw/upload/", "/image/upload/"));
  else if (fileUrl.includes("/image/upload/")) urlsToTry.push(fileUrl.replace("/image/upload/", "/raw/upload/"));
  for (const url of urlsToTry) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
    } catch (_) {}
  }
  return null;
}

export const reindexNoisy = async (req, res, next) => {
  try {
    const dryRun = req.query.dryRun === "true" || req.body?.dryRun === true;
    const reports = await Report.find({}).lean();
    let scanned = 0;
    let candidates = 0;
    let reindexed = 0;
    let failed = 0;
    const details = [];

    for (const report of reports) {
      scanned += 1;
      if (!report.user || !report.fileUrl) continue;

      const pdfRes = await fetchReportFileDual(report.fileUrl);
      if (!pdfRes) continue;
      const buffer = Buffer.from(await pdfRes.arrayBuffer());
      if (!isPdfBuffer(buffer)) continue;

      let text;
      try {
        text = await extractTextFromPdf(buffer);
      } catch {
        continue;
      }
      if (!text || !text.trim()) continue;

      const noiseHits = text.split("\n").filter((l) => NOISE_RE.test(l.trim())).length;
      if (noiseHits === 0) continue;

      candidates += 1;
      details.push({ documentId: report._id.toString(), fileName: report.originalFilename || report.cloudinaryId, noiseLines: noiseHits });

      if (dryRun) continue;

      try {
        const r = await indexDocument({
          userId: report.user.toString(),
          documentId: report._id.toString(),
          type: report.type,
          reportDate: report.reportDate ? new Date(report.reportDate).toISOString().split("T")[0] : null,
          sourceFilename: report.originalFilename || report.cloudinaryId || report._id.toString(),
          text,
        });
        if (r && r.ok !== false) reindexed += 1;
        else failed += 1;
      } catch (err) {
        failed += 1;
        logger.warn(`REINDEX_ERROR ${report._id}: ${err.message}`);
      }
    }

    logger.info(`REINDEX done: scanned=${scanned} candidates=${candidates} reindexed=${reindexed} failed=${failed} dryRun=${dryRun}`);
    res.json({ scanned, candidates, reindexed, failed, dryRun, details: dryRun ? details : undefined });
  } catch (err) {
    next(err);
  }
};
