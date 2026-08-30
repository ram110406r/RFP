import IORedis from "ioredis";

export function createRedisConnection() {
  const url = process.env.REDIS_URL;
  if (!url && process.env.NODE_ENV === "production") {
    throw new Error("REDIS_URL is required in production.");
  }
  const resolvedUrl = url ?? "redis://localhost:6379";
  return new IORedis(resolvedUrl, { maxRetriesPerRequest: null });
}
