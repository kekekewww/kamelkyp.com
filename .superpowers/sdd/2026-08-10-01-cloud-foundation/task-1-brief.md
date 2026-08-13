# Task 1 brief

Plan: docs/superpowers/plans/2026-08-10-01-cloud-foundation.md
Implementation branch: codex/01-cloud-foundation

### Task 1: Pin the toolchain and create the cloud-generated lockfile

**Files:**
- Create: package.json
- Create: .node-version
- Create: .gitignore
- Create: biome.json
- Create: tsconfig.json
- Create: react-router.config.ts
- Create: vite.config.ts
- Create: app/lib/services/service-id.ts
- Create: tests/unit/service-id.test.ts
- Create: .github/workflows/lockfile.yml

**Interfaces:**
- Consumes: none.
- Produces: SERVICE_IDS and ServiceId; npm scripts used by every later task.

- [ ] **Step 1: Commit the failing ServiceId contract test**

~~~ts
// tests/unit/service-id.test.ts
import { describe, expect, it } from "vitest";
import { SERVICE_IDS, isServiceId } from "../../app/lib/services/service-id";

describe("ServiceId contract", () => {
  it("contains exactly the four approved services", () => {
    expect(SERVICE_IDS).toEqual([
      "full_mix",
      "vocal_mix",
      "simple_transition",
      "edit_transition",
    ]);
  });

  it("rejects values outside the stable service identifiers", () => {
    expect(isServiceId("full_mix")).toBe(true);
    expect(isServiceId("mastering_only")).toBe(false);
  });
});
~~~

Cloud commit:

~~~text
Branch: codex/01-cloud-foundation
Message: test: define stable service identifiers
Paths: tests/unit/service-id.test.ts
~~~

- [ ] **Step 2: Run the GitHub Actions unit job and verify the expected failure**

GitHub Actions command:

~~~bash
npm run test:unit -- tests/unit/service-id.test.ts
~~~

Expected result: FAIL because app/lib/services/service-id.ts does not exist.

- [ ] **Step 3: Create the pinned package and TypeScript configuration**

~~~json
{
  "name": "kamelkyp-com",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=24 <25"
  },
  "scripts": {
    "build": "react-router build",
    "check": "npm run format:check && npm run typecheck && npm run test:unit && npm run test:worker && npm run build",
    "cf:typegen": "wrangler types --config wrangler.base.jsonc",
    "format": "biome check --write .",
    "format:check": "biome ci .",
    "typegen": "react-router typegen",
    "typecheck": "npm run typegen && tsc -b",
    "test:unit": "vitest run --config vitest.config.ts tests/unit",
    "test:worker": "vitest run --config vitest.worker.config.ts tests/worker",
    "test:e2e": "playwright test",
    "deploy:preview": "node scripts/render-wrangler-config.mjs preview && wrangler deploy --config .wrangler.generated.jsonc",
    "deploy:production": "node scripts/render-wrangler-config.mjs production && wrangler deploy --config .wrangler.generated.jsonc"
  },
  "dependencies": {
    "isbot": "5.2.1",
    "jose": "6.2.3",
    "react": "19.2.8",
    "react-dom": "19.2.8",
    "react-router": "8.3.0",
    "wavesurfer.js": "7.12.11",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@axe-core/playwright": "4.12.1",
    "@biomejs/biome": "2.5.6",
    "@cloudflare/vite-plugin": "1.48.0",
    "@cloudflare/vitest-pool-workers": "0.16.19",
    "@playwright/test": "1.61.1",
    "@react-router/dev": "8.3.0",
    "@types/react": "19.2.17",
    "@types/react-dom": "19.2.3",
    "typescript": "7.0.2",
    "vite": "8.1.5",
    "vitest": "4.1.10",
    "wrangler": "4.114.0"
  }
}
~~~

~~~ts
// app/lib/services/service-id.ts
export const SERVICE_IDS = [
  "full_mix",
  "vocal_mix",
  "simple_transition",
  "edit_transition",
] as const;

export type ServiceId = (typeof SERVICE_IDS)[number];

export function isServiceId(value: string): value is ServiceId {
  return (SERVICE_IDS as readonly string[]).includes(value);
}
~~~

~~~ts
// react-router.config.ts
import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
} satisfies Config;
~~~

~~~ts
// vite.config.ts
import { cloudflare } from "@cloudflare/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [cloudflare({ configPath: "./wrangler.base.jsonc" }), reactRouter()],
});
~~~

Create .node-version with exactly:

~~~text
24
~~~

Create .gitignore with:

~~~text
node_modules/
build/
playwright-report/
test-results/
.wrangler/
.wrangler.generated.jsonc
.dev.vars
.env
.env.*
!.env.example
~~~

Biome must reject unused imports and format CSS/JSON/TypeScript:

~~~json
{
  "$schema": "https://biomejs.dev/schemas/2.5.6/schema.json",
  "files": {
    "includes": ["**", "!build", "!node_modules", "!playwright-report"]
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "noUnusedImports": "error",
        "noUnusedVariables": "error"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2
  }
}
~~~

- [ ] **Step 4: Add the cloud lockfile workflow and generate package-lock.json**

~~~yaml
# .github/workflows/lockfile.yml
name: Refresh lockfile

on:
  workflow_dispatch:

permissions:
  contents: write

jobs:
  lockfile:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          ref: ${{ github.ref_name }}
      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: npm
      - run: npm install --package-lock-only --ignore-scripts
      - name: Commit lockfile
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add package-lock.json
          git diff --cached --quiet || git commit -m "chore: refresh npm lockfile"
          git push
~~~

Dispatch Refresh lockfile on codex/01-cloud-foundation. Expected result: package-lock.json is committed by github-actions[bot].

- [ ] **Step 5: Verify the ServiceId test passes and commit the scaffold**

GitHub Actions commands:

~~~bash
npm ci
npm run test:unit -- tests/unit/service-id.test.ts
npm run format:check
~~~

Expected result: all commands PASS.

Cloud commit:

~~~text
Message: feat: scaffold React Router 8 Cloudflare project
Paths: package.json, package-lock.json, .node-version, .gitignore,
       biome.json, tsconfig.json, react-router.config.ts, vite.config.ts,
       app/lib/services/service-id.ts, .github/workflows/lockfile.yml
~~~

---
