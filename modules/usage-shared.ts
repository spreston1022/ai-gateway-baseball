// Mirrors the non-cost limits configured on this app's native Budgets and
// Costs policy (By metadata, expression context.custom.userSub). Cost
// itself isn't tracked here — that would require hardcoding a per-model
// price table, which is exactly what the native policy avoids. Keep these
// numbers in sync with the Budgets and Costs rule in the Portal.
export const REQUESTS_DAILY_LIMIT = 500;
export const REQUESTS_HOURLY_LIMIT = 50;
export const TOKENS_HOURLY_LIMIT = 100000;
export const DAILY_TTL_SECONDS = 86400;
export const HOURLY_TTL_SECONDS = 3600;
export const DAILY_CACHE_NAMESPACE = "baseball-usage-daily";
export const HOURLY_CACHE_NAMESPACE = "baseball-usage-hourly";

export interface DailyUsage {
  requests: number;
}

export interface HourlyUsage {
  requests: number;
  tokens: number;
}

function dayStamp(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

function hourStamp(): string {
  return `${dayStamp()}-${new Date().getUTCHours()}`;
}

export function dailyCacheKey(identity: string): string {
  return `${identity}:${dayStamp()}`;
}

export function hourlyCacheKey(identity: string): string {
  return `${identity}:${hourStamp()}`;
}
