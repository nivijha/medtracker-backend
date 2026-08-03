import dotenv from "dotenv";
import { createClient } from "redis";
import logger from "../utils/logger.js";

dotenv.config();

const REDIS_URL = process.env.REDIS_URL;

let client = null;
let enabled = false;

export const connectRedis = async () => {
  if (!REDIS_URL) {
    logger.info("REDIS_URL not set - summary caching will use MongoDB only.");
    return;
  }

  try {
    client = createClient({ url: REDIS_URL });
    client.on("error", (err) => logger.error(`REDIS_ERROR: ${err.message}`));
    await client.connect();
    enabled = true;
    logger.info("Redis connected.");
  } catch (error) {
    enabled = false;
    logger.error(`REDIS_CONNECT_FAILED: ${error.message}`);
  }
};

export const isRedisEnabled = () => enabled;

export const getFromRedis = async (key) => {
  if (!enabled) return null;
  try {
    return await client.get(key);
  } catch (error) {
    logger.error(`REDIS_GET_FAILED: ${error.message}`);
    return null;
  }
};

export const setInRedis = async (key, value, ttlSeconds) => {
  if (!enabled) return;
  try {
    if (ttlSeconds) {
      await client.setEx(key, ttlSeconds, value);
    } else {
      await client.set(key, value);
    }
  } catch (error) {
    logger.error(`REDIS_SET_FAILED: ${error.message}`);
  }
};

export const deleteFromRedis = async (key) => {
  if (!enabled) return;
  try {
    await client.del(key);
  } catch (error) {
    logger.error(`REDIS_DEL_FAILED: ${error.message}`);
  }
};
