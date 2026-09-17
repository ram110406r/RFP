import IORedis from "ioredis";

export function createRedisConnection() {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is required for the worker.");
  }
  return new IORedis(url, { maxRetriesPerRequest: null });
}
