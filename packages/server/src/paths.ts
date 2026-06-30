import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve the directory that holds `static/` assets for Hono `serveStatic`.
 *
 * - **Dev (`tsx src/index.ts`)**: `packages/server/public`
 * - **Prod (`node dist/index.js`)**: same — `dist/` sits beside `public/`
 * - **Desktop bundle**: `ATTACHE_PUBLIC_ROOT` set by Tauri sidecar spawn
 */
export function resolvePublicRoot(moduleUrl: string = import.meta.url): string {
  const override = process.env.ATTACHE_PUBLIC_ROOT?.trim();
  if (override) {
    return override;
  }
  return join(dirname(fileURLToPath(moduleUrl)), "..", "public");
}
