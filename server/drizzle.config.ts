import type { Config } from "drizzle-kit";
import path from "path";

const dbPath =
  process.env.DATABASE_PATH || path.resolve(__dirname, "data/tebroshelf.db");

export default {
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: dbPath,
  },
} satisfies Config;
