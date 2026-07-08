import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts", "src/lib/contacts-filter-combinations.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: { alias: { "@": path.resolve(dir, "src") } },
});
