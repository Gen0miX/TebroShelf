import { z } from "zod";

export const registerUserSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username must be at most 50 characters")
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Username can only contain letters, numbers, and underscores",
    ),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(100, "Password must be at most 100 characters"),
  role: z.enum(["admin", "user"]).default("user"),
});

export type RegisterUserInput = z.infer<typeof registerUserSchema>;

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const fileTypeSchema = z.enum(["epub", "cbz", "cbr"]);
export const contentTypeSchema = z.enum(["book", "manga"]);
export const bookStatusSchema = z.enum(["pending", "enriched", "quarantine"]);
export const visibilitySchema = z.enum(["public", "private"]);

export const createBookSchema = z.object({
  title: z.string().min(1, "Title is required"),
  author: z.string().optional(),
  file_path: z.string().min(1, "File path is required"),
  file_type: fileTypeSchema,
  content_type: contentTypeSchema,
  description: z.string().optional(),
  genres: z.array(z.string()).optional(),
  series: z.string().optional(),
  volume: z.number().int().positive().optional(),
  isbn: z.string().optional(),
  publication_date: z.string().optional(),
});

export const updateBookSchema = createBookSchema.partial();

export type CreateBookInput = z.infer<typeof createBookSchema>;
export type UpdateBookInput = z.infer<typeof updateBookSchema>;
