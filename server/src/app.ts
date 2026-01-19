import express from 'express';
import { json } from 'express';
import cookieParser from 'cookie-parser';
import authRouter from './routes/auth';

const app = express();

app.use(json());
app.use(cookieParser());

app.use('/api/v1/auth', authRouter);

app.get('/api/v1/health', (req, res) => {
  res.json({
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
    },
  });
});

export { app };
