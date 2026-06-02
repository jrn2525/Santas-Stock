import path from "node:path";
import { defineConfig } from "prisma/config";

// Replaces the deprecated `package.json#prisma` block (removed in Prisma 7).
// Keeps the versioned migrations workflow and the seed command.

// Once a Prisma config file exists, the CLI stops auto-loading `.env`. Restore
// that for local CLI use (e.g. `prisma migrate dev`). No-op in production
// (Railway injects real env vars and ships no .env file).
try {
  process.loadEnvFile();
} catch {
  // no .env file present — env vars come from the host environment
}

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
