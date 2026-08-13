export interface Env {
  DB: D1Database;
  SUBMISSION_RATE_LIMITER: RateLimit;
  TURNSTILE_SECRET: string;
  TURNSTILE_SITE_KEY: string;
  CSRF_SECRET: string;
  ACCESS_AUD: string;
  ACCESS_TEAM_DOMAIN: string;
  ADMIN_EMAIL: string;
  APPS_SCRIPT_URL: string;
  APPS_SCRIPT_HMAC_SECRET: string;
  FX_API_URL: string;
  APP_ORIGIN: string;
}
