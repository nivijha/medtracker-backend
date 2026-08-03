import {
  getFromRedis,
  setInRedis,
  deleteFromRedis,
} from "../config/redis.js";

const SUMMARY_TTL_SECONDS = 30 * 24 * 60 * 60;

const summaryKey = (reportId) => `report:summary:${reportId}`;

export const getSummaryFromRedis = async (reportId) => {
  const cached = await getFromRedis(summaryKey(reportId));
  if (!cached) return null;
  try {
    return JSON.parse(cached).summary;
  } catch {
    return cached;
  }
};

export const setSummaryInRedis = async (reportId, summary) => {
  const value = JSON.stringify({ summary, cachedAt: new Date().toISOString() });
  await setInRedis(summaryKey(reportId), value, SUMMARY_TTL_SECONDS);
};

export const deleteSummaryFromRedis = async (reportId) => {
  await deleteFromRedis(summaryKey(reportId));
};
