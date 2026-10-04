import app from './app.js';
import { initDatabase } from './database.js';

const PORT = process.env.PORT || 3001;

initDatabase()
  .then(() => {
    console.log('SQLite database ready');
  })
  .catch((error) => {
    console.error('SQLite init failed (continuing with Supabase only):', error?.message || error);
  })
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`Barangay Saray complaint system running on http://localhost:${PORT}`);
    });
  });
