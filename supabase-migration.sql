-- ============================================
-- BARANGAY SARAY COMPLAINT SYSTEM - SUPABASE MIGRATION
-- Run this SQL in: Supabase Dashboard → SQL Editor
-- ============================================

-- 1. ROLES
CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. USERS
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  auth_id TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  clearance_path TEXT,
  clearance_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check
  CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION', 'REJECTED'));
CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id);

-- 3. CHANNELS
CREATE TABLE IF NOT EXISTS channels (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. COMPLAINT CATEGORIES
CREATE TABLE IF NOT EXISTS complaint_categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. COMPLAINTS
CREATE TABLE IF NOT EXISTS complaints (
  id SERIAL PRIMARY KEY,
  citizen_id INTEGER NOT NULL REFERENCES users(id),
  complaint_id TEXT NOT NULL UNIQUE,
  title TEXT,
  description TEXT NOT NULL,
  category_id INTEGER REFERENCES complaint_categories(id),
  priority TEXT NOT NULL DEFAULT 'MEDIUM',
  status TEXT NOT NULL DEFAULT 'SUBMITTED',
  channel_id INTEGER REFERENCES channels(id),
  assigned_to INTEGER REFERENCES users(id),
  submitted_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  resolution TEXT,
  hearing_info TEXT
);

-- 6. TRIAGE RESULTS
CREATE TABLE IF NOT EXISTS triage_results (
  id SERIAL PRIMARY KEY,
  complaint_id INTEGER NOT NULL UNIQUE REFERENCES complaints(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES complaint_categories(id),
  suggested_priority TEXT,
  confidence DOUBLE PRECISION,
  model_type TEXT DEFAULT 'Naive Bayes',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. REMARKS
CREATE TABLE IF NOT EXISTS remarks (
  id SERIAL PRIMARY KEY,
  complaint_id INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  user_role TEXT NOT NULL,
  remark_text TEXT NOT NULL,
  action_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. HEARINGS
CREATE TABLE IF NOT EXISTS hearings (
  id SERIAL PRIMARY KEY,
  complaint_id INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  scheduled_date TEXT,
  scheduled_time TEXT,
  location TEXT,
  status TEXT DEFAULT 'SCHEDULED',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 9. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. SYSTEM LOGS
CREATE TABLE IF NOT EXISTS system_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  target_record TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 11. SERVICE RATINGS
CREATE TABLE IF NOT EXISTS service_ratings (
  id SERIAL PRIMARY KEY,
  complaint_id INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- SEED DATA
-- ============================================

INSERT INTO roles (name) VALUES ('CITIZEN'), ('TANOD'), ('OFFICIAL'), ('LUPON'), ('ADMIN')
ON CONFLICT (name) DO NOTHING;

INSERT INTO channels (name, description) VALUES
  ('Walk-in', 'In-person complaint at the barangay hall'),
  ('Online', 'Complaint submitted through the online system'),
  ('Phone', 'Complaint called in to the barangay office')
ON CONFLICT (name) DO NOTHING;

INSERT INTO complaint_categories (name, description) VALUES
  ('Noise', 'Noise disturbance complaints'),
  ('Property', 'Property damage or dispute'),
  ('Theft', 'Theft or robbery reports'),
  ('Domestic', 'Domestic or family disputes'),
  ('Public Safety', 'Public safety concerns'),
  ('Other', 'General complaints')
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- ENABLE ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaint_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE triage_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE remarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE hearings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_ratings ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES (allow service_role full access)
-- ============================================

CREATE POLICY "Service role full access" ON roles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON channels FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON complaint_categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON complaints FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON triage_results FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON remarks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON hearings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON notifications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON system_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON service_ratings FOR ALL USING (true) WITH CHECK (true);
