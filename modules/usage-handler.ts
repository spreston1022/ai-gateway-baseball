import { ZuploContext, ZuploRequest, ZoneCache } from "@zuplo/runtime";
import {
  DailyUsage,
  HourlyUsage,
  REQUESTS_DAILY_LIMIT,
  REQUESTS_HOURLY_LIMIT,
  TOKENS_HOURLY_LIMIT,
  DAILY_CACHE_NAMESPACE,
  HOURLY_CACHE_NAMESPACE,
  dailyCacheKey,
  hourlyCacheKey,
} from "./usage-shared";

// Requires generic-jwt-auth-inbound + generic-set-user-context-inbound on
// this route so context.custom.userSub is the verified Auth0 sub, not a
// caller-supplied value.
export default async function (request: ZuploRequest, context: ZuploContext) {
  const identity = context.custom.userSub;
  if (!identity) {
    return new Response(
      JSON.stringify({
        type: "https://httpproblems.com/http-status/401",
        title: "Unauthorized",
        status: 401,
        detail: "No verified user identity on this request.",
      }),
      { status: 401, headers: { "content-type": "application/problem+json" } }
    );
  }

  const dailyCache = new ZoneCache<DailyUsage>(DAILY_CACHE_NAMESPACE, context);
  const hourlyCache = new ZoneCache<HourlyUsage>(HOURLY_CACHE_NAMESPACE, context);
  const dailyRaw = await dailyCache.get(dailyCacheKey(identity));
  const daily: DailyUsage = dailyRaw && typeof dailyRaw === "object" ? dailyRaw : { requests: 0 };
  const hourlyRaw = await hourlyCache.get(hourlyCacheKey(identity));
  const hourly: HourlyUsage = hourlyRaw && typeof hourlyRaw === "object" ? hourlyRaw : { requests: 0, tokens: 0 };

  return new Response(
    JSON.stringify({
      identity,
      requestsDaily: daily.requests,
      requestsDailyLimit: REQUESTS_DAILY_LIMIT,
      requestsDailyRemaining: Math.max(0, REQUESTS_DAILY_LIMIT - daily.requests),
      requestsHourly: hourly.requests,
      requestsHourlyLimit: REQUESTS_HOURLY_LIMIT,
      requestsHourlyRemaining: Math.max(0, REQUESTS_HOURLY_LIMIT - hourly.requests),
      tokensHourly: hourly.tokens,
      tokensHourlyLimit: TOKENS_HOURLY_LIMIT,
      tokensHourlyRemaining: Math.max(0, TOKENS_HOURLY_LIMIT - hourly.tokens),
    }),
    { headers: { "content-type": "application/json" } }
  );
}
