import { z } from "zod";

export const fileWatcherConfigSchema = z.object({
  watchDir: z.string().min(1, "WATCH_DIR must be a non-empty string"),
  ignoredPatterns: z
    .array(z.instanceof(RegExp))
    .default([/(^|[\/\\])\../, /\.part$/, /\.tmp$/, /\.crdownload$/]),
  supportedExtensions: z
    .array(z.string().min(1))
    .default([".epub", ".cbz", ".cbr"]),
  awaitWriteFinish: z
    .object({
      stabilityThreshold: z
        .number()
        .min(500, "stabilityThreshold must be at least 500ms"),
      pollInterval: z.number().min(50, "pollInterval must be at least 50ms"),
    })
    .default({ stabilityThreshold: 2000, pollInterval: 100 }),
});

export type FileWatcherConfig = z.infer<typeof fileWatcherConfigSchema>;

export function getFileWatcherConfig(): FileWatcherConfig {
  const watchDir = process.env.WATCH_DIR;

  if (!watchDir) {
    throw new Error("WATCH_DIR environment variable is not set");
  }
  return fileWatcherConfigSchema.parse({
    watchDir,
  });
}
