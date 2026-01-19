import { app } from './app.js';
import { db } from './db/index.js';

const PORT = process.env.PORT || 3000;

// Initialize database connection on startup
console.log('Database initialized:', db ? 'OK' : 'FAILED');

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
