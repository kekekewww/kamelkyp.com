import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const environment = process.argv[2];
if (environment !== "preview" && environment !== "production") {
  throw new Error("environment_must_be_preview_or_production");
}

const commonRequired = [
  "D1_DATABASE_ID",
  "TURNSTILE_SITE_KEY",
  "RATE_LIMIT_NAMESPACE_ID",
  "ACCESS_AUD",
  "ACCESS_TEAM_DOMAIN",
  "ADMIN_EMAIL",
];
const environmentRequired =
  environment === "production"
    ? ["APP_ORIGIN"]
    : ["PR_NUMBER", "WORKERS_DEV_SUBDOMAIN"];

for (const name of [...commonRequired, ...environmentRequired]) {
  if (!process.env[name]) {
    throw new Error(`missing_${name.toLowerCase()}`);
  }
}

if (
  environment === "preview" &&
  !/^[a-z0-9-]+$/.test(process.env.WORKERS_DEV_SUBDOMAIN ?? "")
) {
  throw new Error("invalid_workers_dev_subdomain");
}

if (
  environment === "preview" &&
  !/^[1-9][0-9]*$/.test(process.env.PR_NUMBER ?? "")
) {
  throw new Error("invalid_pr_number");
}

const rateLimitNamespaceId = process.env.RATE_LIMIT_NAMESPACE_ID;
if (!/^[1-9][0-9]*$/.test(rateLimitNamespaceId ?? "")) {
  throw new Error("invalid_rate_limit_namespace_id");
}

const sourceConfig =
  process.env.WRANGLER_SOURCE_CONFIG ?? "build/server/wrangler.json";
const outputConfig =
  process.env.WRANGLER_OUTPUT_CONFIG ??
  "build/server/.wrangler.generated.jsonc";
const appOrigin =
  environment === "production"
    ? process.env.APP_ORIGIN
    : `https://kamelkyp-com-pr-${process.env.PR_NUMBER}.${process.env.WORKERS_DEV_SUBDOMAIN}.workers.dev`;

let accessTeamDomain;
try {
  accessTeamDomain = new URL(process.env.ACCESS_TEAM_DOMAIN);
} catch {
  throw new Error("invalid_access_team_domain");
}
if (
  accessTeamDomain.protocol !== "https:" ||
  !accessTeamDomain.hostname.endsWith(".cloudflareaccess.com") ||
  accessTeamDomain.pathname !== "/" ||
  accessTeamDomain.search ||
  accessTeamDomain.hash
) {
  throw new Error("invalid_access_team_domain");
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.ADMIN_EMAIL)) {
  throw new Error("invalid_admin_email");
}
if (environment === "production" && appOrigin !== "https://kamelkyp.com") {
  throw new Error("invalid_app_origin");
}

const generated = JSON.parse(await readFile(sourceConfig, "utf8"));
// Media (Content Studio). The R2 binding always comes from R2_MEDIA_BUCKET
// (or none: uploads stay off), so the local-only bucket in wrangler.base.jsonc
// never reaches a deployment.
const r2MediaBucket = process.env.R2_MEDIA_BUCKET?.trim() || null;
if (
  r2MediaBucket !== null &&
  !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(r2MediaBucket)
) {
  throw new Error("invalid_r2_media_bucket");
}

const mediaPublicBaseUrl = process.env.MEDIA_PUBLIC_BASE_URL?.trim() || null;
if (mediaPublicBaseUrl !== null) {
  let url;
  try {
    url = new URL(mediaPublicBaseUrl);
  } catch {
    throw new Error("invalid_media_public_base_url");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("invalid_media_public_base_url");
  }
}

const mediaCorsHosts = process.env.MEDIA_CORS_HOSTS?.trim() || null;
if (
  mediaCorsHosts !== null &&
  !mediaCorsHosts
    .split(",")
    .map((host) => host.trim())
    .every((host) =>
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(
        host,
      ),
    )
) {
  throw new Error("invalid_media_cors_hosts");
}

const imageTransformations = process.env.IMAGE_TRANSFORMATIONS?.trim() || "off";
if (imageTransformations !== "on" && imageTransformations !== "off") {
  throw new Error("invalid_image_transformations");
}

// The Studio dev owner exists only in a local .dev.vars; never render it.
const generatedVars = Object.fromEntries(
  Object.entries(generated.vars ?? {}).filter(
    ([name]) => !name.startsWith("STUDIO_DEV_"),
  ),
);

const config = {
  ...generated,
  name:
    environment === "production"
      ? "kamelkyp-com"
      : `kamelkyp-com-pr-${process.env.PR_NUMBER}`,
  d1_databases: [
    {
      binding: "DB",
      database_name:
        environment === "production"
          ? "kamelkyp-production"
          : "kamelkyp-preview",
      database_id: process.env.D1_DATABASE_ID,
      migrations_dir: "../../migrations",
    },
  ],
  ratelimits: [
    {
      name: "SUBMISSION_RATE_LIMITER",
      namespace_id: rateLimitNamespaceId,
      simple: { limit: 10, period: 60 },
    },
  ],
  r2_buckets: r2MediaBucket
    ? [{ binding: "MEDIA", bucket_name: r2MediaBucket }]
    : [],
  ...(environment === "production"
    ? {
        routes: [{ pattern: "kamelkyp.com", custom_domain: true }],
      }
    : {}),
  secrets: {
    required: [
      "TURNSTILE_SECRET",
      "APPS_SCRIPT_URL",
      "APPS_SCRIPT_HMAC_SECRET",
      "CSRF_SECRET",
    ],
  },
  vars: {
    ...generatedVars,
    TURNSTILE_SITE_KEY: process.env.TURNSTILE_SITE_KEY,
    ACCESS_AUD: process.env.ACCESS_AUD,
    ACCESS_TEAM_DOMAIN: process.env.ACCESS_TEAM_DOMAIN,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    FX_API_URL: "https://api.frankfurter.dev/v1/latest?base=TWD&symbols=USD",
    APP_ORIGIN: appOrigin,
    ...(mediaPublicBaseUrl
      ? { MEDIA_PUBLIC_BASE_URL: mediaPublicBaseUrl }
      : {}),
    ...(mediaCorsHosts ? { MEDIA_CORS_HOSTS: mediaCorsHosts } : {}),
    IMAGE_TRANSFORMATIONS: imageTransformations,
  },
};

await mkdir(dirname(outputConfig), { recursive: true });
await writeFile(outputConfig, `${JSON.stringify(config, null, 2)}\n`);
