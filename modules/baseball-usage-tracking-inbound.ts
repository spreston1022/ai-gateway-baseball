import { ZuploContext, ZuploRequest, ZoneCache } from "@zuplo/runtime";
import {
  DailyUsage,
  HourlyUsage,
  DAILY_TTL_SECONDS,
  HOURLY_TTL_SECONDS,
  DAILY_CACHE_NAMESPACE,
  HOURLY_CACHE_NAMESPACE,
  dailyCacheKey,
  hourlyCacheKey,
} from "./usage-shared";

// Tracks requests/tokens per user purely for display in the baseball app's
// own UI. The native Budgets and Costs policy is what actually enforces
// limits and blocks requests — this policy never blocks anything itself,
// it just counts. Must run after generic-set-user-context-inbound so
// context.custom.userSub is populated.
export default async function (request: ZuploRequest, context: ZuploContext) {
  const identity = context.custom.userSub;
  if (!identity) {
    return request;
  }

  const dailyCache = new ZoneCache<DailyUsage>(DAILY_CACHE_NAMESPACE, context);
  const hourlyCache = new ZoneCache<HourlyUsage>(HOURLY_CACHE_NAMESPACE, context);
  const dKey = dailyCacheKey(identity);
  const hKey = hourlyCacheKey(identity);

  const dailyRaw = await dailyCache.get(dKey);
  const daily: DailyUsage = dailyRaw && typeof dailyRaw === "object" ? dailyRaw : { requests: 0 };
  await dailyCache.put(dKey, { requests: daily.requests + 1 }, DAILY_TTL_SECONDS);

  const hourlyRaw = await hourlyCache.get(hKey);
  const hourly: HourlyUsage = hourlyRaw && typeof hourlyRaw === "object" ? hourlyRaw : { requests: 0, tokens: 0 };
  await hourlyCache.put(hKey, { requests: hourly.requests + 1, tokens: hourly.tokens }, HOURLY_TTL_SECONDS);

  context.addResponseSendingHook(async (response) => {
    if (!response.ok) return response;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/event-stream")) {
      return response;
    }
    try {
      const body = await response.clone().json();
      const totalTokens = body?.usage?.total_tokens;
      if (typeof totalTokens === "number") {
        const latest = (await hourlyCache.get(hKey)) ?? { requests: hourly.requests + 1, tokens: hourly.tokens };
        await hourlyCache.put(hKey, { requests: latest.requests, tokens: latest.tokens + totalTokens }, HOURLY_TTL_SECONDS);
      }
    } catch (e) {
      context.log.warn(`baseball-usage-tracking: failed to read response body for tokens: ${String(e)}`);
    }
    return response;
  });

  return request;
}
