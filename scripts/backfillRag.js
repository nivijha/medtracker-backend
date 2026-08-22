/* Backfill RAG index from existing MongoDB reports.
 *
 * For every Report in MongoDB, fetch its PDF from Cloudinary, extract text, and
 * (re)index it into the FastAPI RAG service. Idempotent by documentId.
 *
 * Usage: node scripts/backfillRag.js
 * Requires: MONGO_URI, RAG_SERVICE_URL, RAG_SERVICE_SECRET (via .env)
 */
import dotenv from "dotenv";
dotenv.config();

import connectDB from "../config/db.js";
import Report from "../models/Report.js";
import { extractTextFromPdf, isPdfBuffer } from "../services/pdfExtractionService.js";
import { indexDocument } from "../services/ragClient.js";
import logger from "../utils/logger.js";

const BATCH = 25;

async function run() {
  await connectDB();
  const cursor = Report.find({}).cursor();
  let processed = 0;
  let indexed = 0;
  let failed = 0;

  for (let report = await cursor.next(); report != null; report = await cursor.next()) {
    processed += 1;
    try {
      const pdfRes = await fetch(report.fileUrl);
      if (!pdfRes.ok) {
        failed += 1;
        logger.warn(`BACKFILL_SKIP ${report._id}: PDF fetch ${pdfRes.status}`);
        continue;
      }
      const buffer = Buffer.from(await pdfRes.arrayBuffer());
      if (!isPdfBuffer(buffer)) {
        failed += 1;
        continue;
      }
      const text = await extractTextFromPdf(buffer);
      if (!text || !text.trim()) {
        failed += 1;
        continue;
      }
      const res = await indexDocument({
        userId: report.user.toString(),
        documentId: report._id.toString(),
        type: report.type,
        reportDate: report.reportDate ? report.reportDate.toISOString().split("T")[0] : null,
        sourceFilename: report.cloudinaryId || report._id.toString(),
        text,
      });
      if (res && res.ok !== false) indexed += 1;
      else failed += 1;
    } catch (err) {
      failed += 1;
      logger.warn(`BACKFILL_ERROR ${report._id}: ${err.message}`);
    }
    if (processed % BATCH === 0) logger.info(`BACKFILL progress: ${processed} processed`);
  }

  logger.info(`BACKFILL done: processed=${processed} indexed=${indexed} failed=${failed}`);
  process.exit(0);
}

run().catch((e) => {
  logger.error(`BACKFILL_CRASH: ${e.message}`);
  process.exit(1);
});
