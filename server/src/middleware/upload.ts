import multer from "multer";
import path from "path";
import fs from "fs";
import { Request } from "express";

const COVERS_DIR = path.join(process.cwd(), "data", "covers");

// Ensure covers directory exists at module load time
if (!fs.existsSync(COVERS_DIR)) {
  fs.mkdirSync(COVERS_DIR, { recursive: true });
}
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIMETYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, COVERS_DIR);
  },
  filename: (req: Request, file, cb) => {
    const bookId = req.params.id;
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `${bookId}${ext}`);
  },
});

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  if (ALLOWED_MIMETYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(`Invalid file type. Allowed: ${ALLOWED_MIMETYPES.join(", ")}`),
    );
  }
};

export const coverUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
}).single("cover");
