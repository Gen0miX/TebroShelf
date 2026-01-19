import { app } from './app.js';
import { db } from './db/index.js';
import { seedAdmin } from './scripts/seed.js';

const PORT = process.env.PORT || 3000;

// Initialize database connection on startup
console.log('Database initialized:', db ? 'OK' : 'FAILED');

// Run initial seeding
seedAdmin().then(() => {
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
});
