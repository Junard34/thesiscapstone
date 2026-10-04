import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const dbPath = path.resolve(process.cwd(), process.env.DB_PATH || './database/barangay.db');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Create a promise-based wrapper for sqlite3
class Database {
  constructor(db) {
    this.db = db;
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  exec(sql) {
    return new Promise((resolve, reject) => {
      this.db.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

const sqlite = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to SQLite database at', dbPath);
  }
});

export const db = new Database(sqlite);

export async function initDatabase() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role_id INTEGER NOT NULL,
      auth_id TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (role_id) REFERENCES roles(id)
    );

    CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id);

    CREATE TABLE IF NOT EXISTS channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS complaint_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS complaints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      citizen_id INTEGER NOT NULL,
      complaint_id TEXT NOT NULL UNIQUE,
      title TEXT,
      description TEXT NOT NULL,
      category_id INTEGER,
      priority TEXT NOT NULL DEFAULT 'MEDIUM',
      status TEXT NOT NULL DEFAULT 'SUBMITTED',
      channel_id INTEGER,
      assigned_to INTEGER,
      submitted_at TEXT DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      resolution TEXT,
      hearing_info TEXT,
      FOREIGN KEY (citizen_id) REFERENCES users(id),
      FOREIGN KEY (category_id) REFERENCES complaint_categories(id),
      FOREIGN KEY (channel_id) REFERENCES channels(id),
      FOREIGN KEY (assigned_to) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS triage_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id INTEGER NOT NULL UNIQUE,
      category_id INTEGER,
      suggested_priority TEXT,
      confidence REAL,
      model_type TEXT DEFAULT 'Naive Bayes',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (complaint_id) REFERENCES complaints(id),
      FOREIGN KEY (category_id) REFERENCES complaint_categories(id)
    );

    CREATE TABLE IF NOT EXISTS remarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      user_role TEXT NOT NULL,
      remark_text TEXT NOT NULL,
      action_type TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (complaint_id) REFERENCES complaints(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS hearings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id INTEGER NOT NULL,
      scheduled_date TEXT,
      scheduled_time TEXT,
      location TEXT,
      status TEXT DEFAULT 'SCHEDULED',
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (complaint_id) REFERENCES complaints(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS system_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      target_record TEXT,
      details TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS service_ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      feedback TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (complaint_id) REFERENCES complaints(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  await db.exec(`CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id)`).catch(() => {});

  await db.all(`PRAGMA table_info(users)`).then(async (columns) => {
    const hasAuthId = columns.some((col) => col.name === 'auth_id');
    if (!hasAuthId) {
      await db.exec(`ALTER TABLE users ADD COLUMN auth_id TEXT`);
      await db.exec(`CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id)`);
    }
  }).catch(() => {});

  await seedDefaultData();
}

async function seedDefaultData() {
  const { default: bcrypt } = await import('bcryptjs');
  
  const defaultRoles = ['CITIZEN', 'TANOD', 'OFFICIAL', 'LUPON', 'ADMIN'];
  for (const roleName of defaultRoles) {
    try {
      await db.run(
        `INSERT OR IGNORE INTO roles (name) VALUES (?)`,
        [roleName]
      );
    } catch (err) {
      console.error('Error seeding roles:', err);
    }
  }

  const defaultCategories = [
    'Public Safety',
    'Infrastructure',
    'Health',
    'Noise',
    'Dispute/Conflict',
    'Threat',
    'Bullying/Harassment',
    'Drug-related concern',
  ];

  for (const categoryName of defaultCategories) {
    try {
      await db.run(
        `INSERT OR IGNORE INTO complaint_categories (name) VALUES (?)`,
        [categoryName]
      );
    } catch (err) {
      console.error('Error seeding categories:', err);
    }
  }

  const defaultChannels = ['Online form', 'SMS/Text', 'Walk-in'];
  for (const channelName of defaultChannels) {
    try {
      await db.run(
        `INSERT OR IGNORE INTO channels (name) VALUES (?)`,
        [channelName]
      );
    } catch (err) {
      console.error('Error seeding channels:', err);
    }
  }

  // Static admin account (always guaranteed to exist)
  const adminRole = await db.get(`SELECT id FROM roles WHERE name = 'ADMIN'`);
  if (adminRole) {
    const adminExists = await db.get(`SELECT id FROM users WHERE email = 'admin@example.com'`);
    if (!adminExists) {
      const adminHash = await bcrypt.hash('password123', 10);
      await db.run(
        `INSERT INTO users (full_name, email, password_hash, role_id, status) VALUES (?, ?, ?, ?, 'ACTIVE')`,
        ['Admin User', 'admin@example.com', adminHash, adminRole.id]
      );
      console.log('Static admin account created: admin@example.com / password123');
    }
  }

  const demoUsers = [
    { fullName: 'Citizen User', email: 'citizen@example.com', password: 'password123', role: 'CITIZEN' },
    { fullName: 'Tanod User', email: 'tanod@example.com', password: 'password123', role: 'TANOD' },
    { fullName: 'Official User', email: 'official@example.com', password: 'password123', role: 'OFFICIAL' },
    { fullName: 'Lupon User', email: 'lupon@example.com', password: 'password123', role: 'LUPON' },
  ];

  for (const user of demoUsers) {
    try {
      const role = await db.get(`SELECT id FROM roles WHERE name = ?`, [user.role]);
      if (!role) continue;

      const existing = await db.get(`SELECT id FROM users WHERE email = ?`, [user.email]);
      if (!existing) {
        const passwordHash = await bcrypt.hash(user.password, 10);
        await db.run(
          `INSERT INTO users (full_name, email, password_hash, role_id, status) VALUES (?, ?, ?, ?, 'ACTIVE')`,
          [user.fullName, user.email, passwordHash, role.id]
        );
      }
    } catch (err) {
      console.error(`Error seeding user ${user.email}:`, err);
    }
  }
}
