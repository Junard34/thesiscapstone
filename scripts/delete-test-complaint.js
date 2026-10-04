const sqlite3 = require('sqlite3');

const db = new sqlite3.Database('./database/barangay.db');
const matches = ['Delete test', 'This complaint should be removable.'];

console.log('Removing the test complaint row...');

db.serialize(() => {
  db.run(
    'DELETE FROM triage_results WHERE complaint_id IN (SELECT id FROM complaints WHERE title = ? OR description = ?)',
    matches
  );

  db.run(
    'DELETE FROM remarks WHERE complaint_id IN (SELECT id FROM complaints WHERE title = ? OR description = ?)',
    matches
  );

  db.run(
    'DELETE FROM hearings WHERE complaint_id IN (SELECT id FROM complaints WHERE title = ? OR description = ?)',
    matches
  );

  db.run(
    "DELETE FROM system_logs WHERE target_record IN (SELECT 'complaint_' || id FROM complaints WHERE title = ? OR description = ?)",
    matches
  );

  db.run(
    'DELETE FROM complaints WHERE title = ? OR description = ?',
    matches,
    function (err) {
      if (err) {
        console.error('Delete failed:', err);
        process.exit(1);
      }

      console.log('Deleted rows:', this.changes);

      db.all(
        'SELECT id, complaint_id, title, description FROM complaints WHERE title = ? OR description = ? ORDER BY id DESC',
        matches,
        (dbErr, rows) => {
          if (dbErr) {
            console.error('Verification failed:', dbErr);
            process.exit(1);
          }

          console.log('Remaining matching rows:', JSON.stringify(rows, null, 2));
          db.close();
        }
      );
    }
  );
});
