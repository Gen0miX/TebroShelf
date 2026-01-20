import express from 'express';
import { json } from 'express';
import cookieParser from 'cookie-parser';
import authRouter from './routes/auth';
import adminRouter from './routes/admin';
import booksRouter from './routes/books';

const app = express();

app.use(json());
app.use(cookieParser());

// Public routes
app.use('/api/v1/auth', authRouter);

// Admin routes (authentication + admin role middleware applied in adminRouter)
app.use('/api/v1/admin', adminRouter);

// Books routes (authentication required, visibility filtered by role)
app.use('/api/v1/books', booksRouter);

app.get('/api/v1/health', (req, res) => {
  res.json({
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
    },
  });
});

export { app };
