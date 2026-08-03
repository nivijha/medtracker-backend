import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

export const extractTextFromPdf = async (buffer) => {
  const parser = new pdfParse.PDFParse({ data: buffer });
  try {
    const pdfData = await parser.getText();
    return pdfData.text || "";
  } finally {
    await parser.destroy();
  }
};

export const isPdfBuffer = (buffer) =>
  buffer.length >= 4 && buffer.slice(0, 4).toString() === "%PDF";
