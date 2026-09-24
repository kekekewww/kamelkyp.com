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
  /** R2 bucket for Studio uploads; absent → uploads off (external URLs only). */
  MEDIA?: R2Bucket;
  /** Public origin of the media bucket, e.g. `https://media.kamelkyp.com`. */
  MEDIA_PUBLIC_BASE_URL?: string;
  /** Comma list of hosts allowed for Web Audio analysis (bucket CORS set). */
  MEDIA_CORS_HOSTS?: string;
  /** `on` enables `/cdn-cgi/image/` variants; anything else = originals. */
  IMAGE_TRANSFORMATIONS?: string;
  /**
   * Local dev server only (`.dev.vars`): lets `react-router dev` act as the
   * owner when it equals ADMIN_EMAIL. Dead code in every build
   * (`import.meta.env.DEV`), rejected by `verify-production-config.mjs`.
   */
  STUDIO_DEV_OWNER_EMAIL?: string;
}
