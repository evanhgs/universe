import "server-only";

import Redis from "ioredis";

let redis: Redis | null = null;

function getRedisUrl() {
    const url = process.env.REDIS_URL?.trim();

    if (!url) {
        throw new Error("redis_not_configured");
    }
    return url;
}

export function getRedis() {
    if (!redis) {
        redis = new Redis(getRedisUrl(), {
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            lazyConnect: true,
        });
    }
    return redis;
}