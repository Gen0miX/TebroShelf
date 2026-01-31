import express from "express";
import { json } from "express";
import cookieParser from "cookie-parser";
import path from "path";
import authRouter from "./routes/auth";
import adminRouter from "./routes/admin";
import booksRouter from "./routes/books";
import quarantineRouter from "./routes/quarantine";
import metadataRouter from "./routes/metadata";

const app = express();

app.use(json());
app.use(cookieParser());

// Serve static files (covers, etc.) from data directory
app.use("/static", express.static(path.join(__dirname, "../data")));

// Public routes
app.use("/api/v1/auth", authRouter);

// Admin routes (authentication + admin role middleware applied in adminRouter)
app.use("/api/v1/admin", adminRouter);

// Books routes (authentication required, visibility filtered by role)
app.use("/api/v1/books", booksRouter);

// Quarantine routes (authentication required, visibility for admin)
app.use("/api/v1/quarantine", quarantineRouter);

// Metadata routes (authentification required, visibility for admin)
app.use("/api/v1/metadata", metadataRouter);

app.get("/api/v1/health", (req, res) => {
  res.json({
    data: {
      status: "ok",
      timestamp: new Date().toISOString(),
    },
  });
});

export { app };
