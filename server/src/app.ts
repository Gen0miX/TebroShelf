import express from 'express';
import { json } from 'express';

const app = express();

app.use(json());

app.get('/api/v1/health', (req, res) => {
  res.json({
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
    },
  });
});

export { app };
