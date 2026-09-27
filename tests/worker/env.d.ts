declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
    /** Second, initially empty D1 used by the staged legacy-import tests. */
    LEGACY_DB: D1Database;
  }
}
