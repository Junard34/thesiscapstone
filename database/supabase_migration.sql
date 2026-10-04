  -- ============================================================================
  -- Barangay Saray Complaint Management System — Supabase Migration
  -- ============================================================================
  -- Generated from: server/database.js + 1234.docx ERD
  -- Tables: 12 | RLS Policies: 44 | Views: 4
  --
  -- FOR A NEW DATABASE: Execute this in the Supabase SQL Editor first:
  --   DROP SCHEMA public CASCADE;
  --   CREATE SCHEMA public;
  --   GRANT ALL ON SCHEMA public TO postgres;
  --   GRANT ALL ON SCHEMA public TO anon;
  --   GRANT ALL ON SCHEMA public TO authenticated;
  --   GRANT ALL ON SCHEMA public TO service_role;
  --
  -- Then paste and run this entire file. The DROP SCHEMA command deletes all
  -- existing public data, so do not use this reset migration on a live database.
  -- For an existing database, run only the required ALTER/policy/trigger changes
  -- after checking the current schema instead of rerunning this full file.
  -- ============================================================================

  -- ============================================================================
  -- EXTENSIONS
  -- ============================================================================
  CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";

  -- ============================================================================
  -- 1. ROLES
  -- ============================================================================
  CREATE TABLE public.roles (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- ============================================================================
  -- 2. USERS
  -- ============================================================================
  CREATE TABLE IF NOT EXISTS public.users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_id       UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name     TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    address       TEXT,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'CITIZEN',
    status        TEXT NOT NULL DEFAULT 'ACTIVE'
                  CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION', 'REJECTED')),
    clearance_path TEXT,
    clearance_name TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS auth_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE;

  ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS address TEXT;

  ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'CITIZEN';

  ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS clearance_path TEXT;

  ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS clearance_name TEXT;

  ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_status_check;
  ALTER TABLE public.users
    ADD CONSTRAINT users_status_check CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION', 'REJECTED'));

  CREATE INDEX idx_users_email   ON public.users (email);
  CREATE INDEX IF NOT EXISTS idx_users_role ON public.users (role);

  -- Keep a public profile row synchronized with every Supabase Auth account.
  CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
  RETURNS TRIGGER AS $$
  BEGIN
    INSERT INTO public.users (
      id,
      auth_id,
      full_name,
      email,
      address,
      password_hash,
      role,
      status
    ) VALUES (
      NEW.id,
      NEW.id,
      COALESCE(
        NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
        NULLIF(NEW.raw_user_meta_data->>'name', ''),
        split_part(NEW.email, '@', 1)
      ),
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'address', ''),
      '',
      UPPER(COALESCE(NEW.raw_user_meta_data->>'role', 'CITIZEN')),
      CASE
        WHEN UPPER(COALESCE(NEW.raw_user_meta_data->>'role', 'CITIZEN')) = 'CITIZEN'
          THEN 'PENDING_VERIFICATION'
        ELSE 'ACTIVE'
      END
    )
    ON CONFLICT (auth_id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      email = EXCLUDED.email,
      address = EXCLUDED.address,
      role = EXCLUDED.role,
      updated_at = now();

    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

  DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

  INSERT INTO storage.buckets (id, name, public)
  VALUES ('citizen-documents', 'citizen-documents', true)
  ON CONFLICT (id) DO UPDATE SET public = true;

  -- ============================================================================
  -- 3. CHANNELS
  -- ============================================================================
  CREATE TABLE public.channels (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- ============================================================================
  -- 4. COMPLAINT CATEGORIES
  -- ============================================================================
  CREATE TABLE public.complaint_categories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- ============================================================================
  -- 5. COMPLAINTS
  -- ============================================================================
  CREATE TABLE public.complaints (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    citizen_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    complaint_id  TEXT NOT NULL UNIQUE,
    title         TEXT,
    description   TEXT NOT NULL,
    category_id   UUID REFERENCES public.complaint_categories(id) ON DELETE SET NULL,
    priority      TEXT NOT NULL DEFAULT 'MEDIUM'
                  CHECK (priority IN ('HIGH', 'MEDIUM', 'LOW')),
    status        TEXT NOT NULL DEFAULT 'SUBMITTED'
                  CHECK (status IN (
                    'SUBMITTED',
                    'UNDER REVIEW',
                    'TRIAGED',
                    'ASSIGNED',
                    'IN PROGRESS',
                    'FOR HEARING / MEDIATION',
                    'RESOLVED',
                    'CLOSED'
                  )),
    channel_id    UUID REFERENCES public.channels(id) ON DELETE SET NULL,
    assigned_to   UUID REFERENCES public.users(id) ON DELETE SET NULL,
    resolution    TEXT,
    hearing_info  TEXT,
    submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX idx_complaints_citizen_id   ON public.complaints (citizen_id);
  CREATE INDEX idx_complaints_category_id  ON public.complaints (category_id);
  CREATE INDEX idx_complaints_channel_id   ON public.complaints (channel_id);
  CREATE INDEX idx_complaints_assigned_to  ON public.complaints (assigned_to);
  CREATE INDEX idx_complaints_status       ON public.complaints (status);
  CREATE INDEX idx_complaints_priority     ON public.complaints (priority);
  CREATE INDEX idx_complaints_complaint_id ON public.complaints (complaint_id);

  -- ============================================================================
  -- 6. TRIAGE RESULTS
  -- ============================================================================
  CREATE TABLE public.triage_results (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id       UUID NOT NULL UNIQUE REFERENCES public.complaints(id) ON DELETE CASCADE,
    category_id        UUID REFERENCES public.complaint_categories(id) ON DELETE SET NULL,
    suggested_priority TEXT,
    confidence         REAL,
    model_type         TEXT NOT NULL DEFAULT 'Naive Bayes',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- ============================================================================
  -- 7. REMARKS
  -- ============================================================================
  CREATE TABLE public.remarks (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id  UUID NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    user_role     TEXT NOT NULL,
    remark_text   TEXT NOT NULL,
    action_type   TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX idx_remarks_complaint_id ON public.remarks (complaint_id);
  CREATE INDEX idx_remarks_user_id      ON public.remarks (user_id);

  -- ============================================================================
  -- 8. HEARINGS
  -- ============================================================================
  CREATE TABLE public.hearings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id    UUID NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
    scheduled_date  TEXT,
    scheduled_time  TEXT,
    location        TEXT,
    status          TEXT NOT NULL DEFAULT 'SCHEDULED'
                    CHECK (status IN ('SCHEDULED', 'IN PROGRESS', 'COMPLETED', 'CANCELLED', 'RESCHEDULED')),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX idx_hearings_complaint_id ON public.hearings (complaint_id);

  -- ============================================================================
  -- 9. NOTIFICATIONS
  -- ============================================================================
  CREATE TABLE public.notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    message     TEXT NOT NULL,
    is_read     BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX idx_notifications_user_id ON public.notifications (user_id);

  -- ============================================================================
  -- 10. SYSTEM LOGS
  -- ============================================================================
  CREATE TABLE public.system_logs (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID REFERENCES public.users(id) ON DELETE SET NULL,
    action         TEXT NOT NULL,
    target_record  TEXT,
    details        JSONB,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX idx_system_logs_user_id       ON public.system_logs (user_id);
  CREATE INDEX idx_system_logs_action        ON public.system_logs (action);
  CREATE INDEX idx_system_logs_target_record ON public.system_logs (target_record);
  CREATE INDEX idx_system_logs_created_at    ON public.system_logs (created_at);

  -- ============================================================================
  -- 11. EVIDENCE FILES (from docx ERD)
  -- ============================================================================
  CREATE TABLE public.evidence_files (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id  UUID NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
    uploaded_by   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    file_name     TEXT NOT NULL,
    file_url      TEXT NOT NULL,
    file_type     TEXT,
    file_size     BIGINT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX idx_evidence_files_complaint_id ON public.evidence_files (complaint_id);
  CREATE INDEX idx_evidence_files_uploaded_by  ON public.evidence_files (uploaded_by);

  -- ============================================================================
  -- 12. RESPONSIBLE PERSONS (from docx ERD)
  -- ============================================================================
  CREATE TABLE public.responsible_persons (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id  UUID NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role          TEXT NOT NULL,
    assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE INDEX idx_responsible_persons_complaint_id ON public.responsible_persons (complaint_id);
  CREATE INDEX idx_responsible_persons_user_id      ON public.responsible_persons (user_id);

  -- ============================================================================
  -- TRIGGER FUNCTION: auto-update updated_at
  -- ============================================================================
  CREATE OR REPLACE FUNCTION public.update_updated_at()
  RETURNS TRIGGER AS $$
  BEGIN
    NEW.updated_at = now();
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.users                FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.roles                FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.channels             FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.complaint_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.complaints           FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.triage_results       FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.hearings             FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

  -- ============================================================================
  -- HELPER FUNCTIONS
  -- ============================================================================
  CREATE OR REPLACE FUNCTION public.get_user_role(p_user_id UUID)
  RETURNS TEXT AS $$
    SELECT u.role FROM public.users u
    WHERE u.id = p_user_id;
  $$ LANGUAGE sql STABLE SECURITY DEFINER;

  CREATE OR REPLACE FUNCTION public.get_user_by_email(p_email TEXT)
  RETURNS UUID AS $$
    SELECT id FROM public.users WHERE email = p_email;
  $$ LANGUAGE sql STABLE SECURITY DEFINER;

  CREATE OR REPLACE FUNCTION public.is_admin()
  RETURNS BOOLEAN AS $$
    SELECT EXISTS (
      SELECT 1
      FROM public.users u
      WHERE (u.id = auth.uid() OR u.auth_id = auth.uid())
        AND u.role = 'ADMIN'
    );
  $$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

  -- ============================================================================
  -- ROW LEVEL SECURITY (RLS)
  -- ============================================================================

  ALTER TABLE public.roles                ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.users                ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.channels             ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.complaint_categories ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.complaints           ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.triage_results       ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.remarks              ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.hearings             ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.notifications        ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.system_logs          ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.evidence_files       ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.responsible_persons  ENABLE ROW LEVEL SECURITY;

  -- ROLES
  CREATE POLICY "roles_select_authenticated" ON public.roles
    FOR SELECT USING (auth.role() = 'authenticated');

  -- USERS
  DROP POLICY IF EXISTS "users_select_own" ON public.users;
  DROP POLICY IF EXISTS "users_select_admin" ON public.users;
  DROP POLICY IF EXISTS "users_update_own" ON public.users;
  DROP POLICY IF EXISTS "users_update_admin" ON public.users;
  DROP POLICY IF EXISTS "users_insert_admin" ON public.users;
  DROP POLICY IF EXISTS "users_delete_admin" ON public.users;

  CREATE POLICY "users_select_own" ON public.users
    FOR SELECT USING (id = auth.uid() OR auth_id = auth.uid());

  CREATE POLICY "users_select_admin" ON public.users
    FOR SELECT USING (
      public.is_admin()
    );

  CREATE POLICY "users_update_own" ON public.users
    FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

  CREATE POLICY "users_update_admin" ON public.users
    FOR UPDATE USING (
      public.is_admin()
    );

  CREATE POLICY "users_insert_admin" ON public.users
    FOR INSERT WITH CHECK (
      public.is_admin()
    );

  CREATE POLICY "users_delete_admin" ON public.users
    FOR DELETE USING (
      public.is_admin()
    );

  -- CHANNELS
  CREATE POLICY "channels_select_authenticated" ON public.channels
    FOR SELECT USING (auth.role() = 'authenticated');

  CREATE POLICY "channels_manage_admin" ON public.channels
    FOR ALL USING (
      EXISTS (SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('ADMIN', 'OFFICIAL'))
    );

  -- COMPLAINT CATEGORIES
  CREATE POLICY "categories_select_authenticated" ON public.complaint_categories
    FOR SELECT USING (auth.role() = 'authenticated');

  CREATE POLICY "categories_manage_admin" ON public.complaint_categories
    FOR ALL USING (
      EXISTS (SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('ADMIN', 'OFFICIAL'))
    );

  -- COMPLAINTS
  CREATE POLICY "complaints_select_own" ON public.complaints
    FOR SELECT USING (citizen_id = auth.uid());

  CREATE POLICY "complaints_select_staff" ON public.complaints
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('TANOD', 'OFFICIAL', 'LUPON', 'ADMIN'))
    );

  CREATE POLICY "complaints_insert_citizen" ON public.complaints
    FOR INSERT WITH CHECK (citizen_id = auth.uid());

  CREATE POLICY "complaints_insert_staff" ON public.complaints
    FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('OFFICIAL', 'ADMIN'))
    );

  CREATE POLICY "complaints_update_official" ON public.complaints
    FOR UPDATE USING (
      EXISTS (SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('OFFICIAL', 'ADMIN'))
    );

  CREATE POLICY "complaints_update_tanod" ON public.complaints
    FOR UPDATE USING (
      assigned_to = auth.uid()
      AND EXISTS (SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role = 'TANOD')
    );

  CREATE POLICY "complaints_update_lupon" ON public.complaints
    FOR UPDATE USING (
      assigned_to = auth.uid()
      AND EXISTS (SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role = 'LUPON')
    );

  CREATE POLICY "complaints_delete_admin" ON public.complaints
    FOR DELETE USING (
      EXISTS (SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role = 'ADMIN')
    );

  -- TRIAGE RESULTS
  CREATE POLICY "triage_select_staff" ON public.triage_results
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('OFFICIAL', 'ADMIN'))
    );

  CREATE POLICY "triage_insert_staff" ON public.triage_results
    FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('OFFICIAL', 'ADMIN'))
    );

  CREATE POLICY "triage_update_official" ON public.triage_results
    FOR UPDATE USING (
      EXISTS (SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('OFFICIAL', 'ADMIN'))
    );

  -- REMARKS
  CREATE POLICY "remarks_select_complaint_owner" ON public.remarks
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.complaints c
        WHERE c.id = remarks.complaint_id AND c.citizen_id = auth.uid())
    );

  CREATE POLICY "remarks_select_staff" ON public.remarks
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('TANOD', 'OFFICIAL', 'LUPON', 'ADMIN'))
    );

  CREATE POLICY "remarks_insert_staff" ON public.remarks
    FOR INSERT WITH CHECK (
      user_id = auth.uid()
      AND EXISTS (SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('TANOD', 'OFFICIAL', 'LUPON'))
    );

  CREATE POLICY "remarks_insert_citizen" ON public.remarks
    FOR INSERT WITH CHECK (
      user_id = auth.uid()
      AND EXISTS (SELECT 1 FROM public.complaints c
        WHERE c.id = remarks.complaint_id AND c.citizen_id = auth.uid())
    );

  -- HEARINGS
  CREATE POLICY "hearings_select_citizen" ON public.hearings
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.complaints c
        WHERE c.id = hearings.complaint_id AND c.citizen_id = auth.uid())
    );

  CREATE POLICY "hearings_select_staff" ON public.hearings
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('TANOD', 'OFFICIAL', 'LUPON', 'ADMIN'))
    );

  CREATE POLICY "hearings_insert_official" ON public.hearings
    FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('OFFICIAL', 'LUPON', 'ADMIN'))
    );

  CREATE POLICY "hearings_update_official" ON public.hearings
    FOR UPDATE USING (
      EXISTS (SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('OFFICIAL', 'LUPON', 'ADMIN'))
    );

  -- NOTIFICATIONS
  CREATE POLICY "notifications_select_own" ON public.notifications
    FOR SELECT USING (user_id = auth.uid());

  CREATE POLICY "notifications_insert_authenticated" ON public.notifications
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

  CREATE POLICY "notifications_update_own" ON public.notifications
    FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

  CREATE POLICY "notifications_delete_own" ON public.notifications
    FOR DELETE USING (user_id = auth.uid());

  -- SYSTEM LOGS
  CREATE POLICY "system_logs_select_admin" ON public.system_logs
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role = 'ADMIN')
    );

  CREATE POLICY "system_logs_insert_authenticated" ON public.system_logs
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

  -- EVIDENCE FILES
  CREATE POLICY "evidence_select_citizen" ON public.evidence_files
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.complaints c
        WHERE c.id = evidence_files.complaint_id AND c.citizen_id = auth.uid())
    );

  CREATE POLICY "evidence_select_staff" ON public.evidence_files
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('TANOD', 'OFFICIAL', 'LUPON', 'ADMIN'))
    );

  CREATE POLICY "evidence_insert_authenticated" ON public.evidence_files
    FOR INSERT WITH CHECK (uploaded_by = auth.uid() AND auth.role() = 'authenticated');

  CREATE POLICY "evidence_delete_admin" ON public.evidence_files
    FOR DELETE USING (
      EXISTS (SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role = 'ADMIN')
    );

  -- RESPONSIBLE PERSONS
  CREATE POLICY "responsible_select_citizen" ON public.responsible_persons
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.complaints c
        WHERE c.id = responsible_persons.complaint_id AND c.citizen_id = auth.uid())
    );

  CREATE POLICY "responsible_select_staff" ON public.responsible_persons
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('TANOD', 'OFFICIAL', 'LUPON', 'ADMIN'))
    );

  CREATE POLICY "responsible_insert_official" ON public.responsible_persons
    FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('OFFICIAL', 'ADMIN'))
    );

  CREATE POLICY "responsible_delete_official" ON public.responsible_persons
    FOR DELETE USING (
      EXISTS (SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role IN ('OFFICIAL', 'ADMIN'))
    );

  -- ============================================================================
  -- VIEWS
  -- ============================================================================

  CREATE OR REPLACE VIEW public.v_complaints_full AS
  SELECT
    c.id,
    c.complaint_id,
    c.title,
    c.description,
    c.priority,
    c.status,
    c.submitted_at,
    c.created_at,
    c.updated_at,
    c.resolution,
    c.hearing_info,
    cat.name          AS category_name,
    ch.name           AS channel_name,
    u.full_name       AS citizen_name,
    u.email           AS citizen_email,
    a.full_name       AS assigned_to_name,
    tr.suggested_priority,
    tr.confidence,
    tr.model_type
  FROM public.complaints c
  LEFT JOIN public.complaint_categories cat ON cat.id = c.category_id
  LEFT JOIN public.channels ch              ON ch.id  = c.channel_id
  LEFT JOIN public.users u                  ON u.id   = c.citizen_id
  LEFT JOIN public.users a                  ON a.id   = c.assigned_to
  LEFT JOIN public.triage_results tr        ON tr.complaint_id = c.id;

  CREATE OR REPLACE VIEW public.v_report_summary AS
  SELECT
    COUNT(*)                                    AS total_complaints,
    COUNT(*) FILTER (WHERE status != 'CLOSED')  AS open_cases,
    COUNT(*) FILTER (WHERE status = 'RESOLVED') AS resolved_cases,
    COUNT(*) FILTER (WHERE priority = 'HIGH')   AS high_priority,
    COUNT(*) FILTER (WHERE priority = 'MEDIUM') AS medium_priority,
    COUNT(*) FILTER (WHERE priority = 'LOW')    AS low_priority
  FROM public.complaints;

  CREATE OR REPLACE VIEW public.v_complaints_by_category AS
  SELECT
    cat.name    AS category,
    COUNT(c.id) AS total
  FROM public.complaint_categories cat
  LEFT JOIN public.complaints c ON c.category_id = cat.id
  GROUP BY cat.id, cat.name;

  CREATE OR REPLACE VIEW public.v_complaints_by_status AS
  SELECT
    status,
    COUNT(*) AS total
  FROM public.complaints
  GROUP BY status;

  -- ============================================================================
  -- SEED DATA
  -- ============================================================================

  INSERT INTO public.roles (name) VALUES ('CITIZEN');
  INSERT INTO public.roles (name) VALUES ('TANOD');
  INSERT INTO public.roles (name) VALUES ('OFFICIAL');
  INSERT INTO public.roles (name) VALUES ('LUPON');
  INSERT INTO public.roles (name) VALUES ('ADMIN');

  -- Backfill profiles for Auth users created before the profile trigger existed.
  UPDATE public.users u
  SET
    auth_id = au.id,
    full_name = COALESCE(
      NULLIF(au.raw_user_meta_data->>'full_name', ''),
      NULLIF(au.raw_user_meta_data->>'name', ''),
      u.full_name
    ),
    address = COALESCE(au.raw_user_meta_data->>'address', u.address, ''),
    role = UPPER(COALESCE(au.raw_user_meta_data->>'role', 'CITIZEN')),
    updated_at = now()
  FROM auth.users au
  WHERE u.email = au.email
    AND u.auth_id IS NULL;

  INSERT INTO public.users (
    id,
    auth_id,
    full_name,
    email,
    address,
    password_hash,
    role,
    status
  )
  SELECT
    au.id,
    au.id,
    COALESCE(
      NULLIF(au.raw_user_meta_data->>'full_name', ''),
      NULLIF(au.raw_user_meta_data->>'name', ''),
      split_part(au.email, '@', 1)
    ),
    au.email,
    COALESCE(au.raw_user_meta_data->>'address', ''),
    '',
    UPPER(COALESCE(au.raw_user_meta_data->>'role', 'CITIZEN')),
    'ACTIVE'
  FROM auth.users au
  WHERE NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.auth_id = au.id
  );

  INSERT INTO public.complaint_categories (name, description) VALUES ('Public Safety', 'Concerns related to community safety, security, and peace and order');
  INSERT INTO public.complaint_categories (name, description) VALUES ('Infrastructure', 'Issues with roads, buildings, drainage, and other public facilities');
  INSERT INTO public.complaint_categories (name, description) VALUES ('Health', 'Health-related concerns and public health issues');
  INSERT INTO public.complaint_categories (name, description) VALUES ('Noise', 'Noise complaints and disturbances');
  INSERT INTO public.complaint_categories (name, description) VALUES ('Dispute/Conflict', 'Interpersonal or community disputes requiring mediation');
  INSERT INTO public.complaint_categories (name, description) VALUES ('Threat', 'Reports of threats to individuals or groups');
  INSERT INTO public.complaint_categories (name, description) VALUES ('Bullying/Harassment', 'Cases of bullying, harassment, or intimidation');
  INSERT INTO public.complaint_categories (name, description) VALUES ('Drug-related concern', 'Reports involving illegal drugs or substance abuse');

  INSERT INTO public.channels (name, description) VALUES ('Online form', 'Complaints submitted through the web portal');
  INSERT INTO public.channels (name, description) VALUES ('SMS/Text', 'Complaints received via text message');
  INSERT INTO public.channels (name, description) VALUES ('Walk-in', 'Complaints filed in person at the barangay office');

  -- Demo users (password: password123)
  INSERT INTO public.users (full_name, email, password_hash, role, status)
    SELECT 'Citizen User', 'citizen@example.com', '$2a$10$YQ8GvFOEJQpHCpVz/VQEhOJQVvQHJp1gVJvJLkZfHpX2iGqZmQiXe', 'CITIZEN', 'ACTIVE';

  INSERT INTO public.users (full_name, email, password_hash, role, status)
    SELECT 'Tanod User', 'tanod@example.com', '$2a$10$YQ8GvFOEJQpHCpVz/VQEhOJQVvQHJp1gVJvJLkZfHpX2iGqZmQiXe', 'TANOD', 'ACTIVE';

  INSERT INTO public.users (full_name, email, password_hash, role, status)
    SELECT 'Official User', 'official@example.com', '$2a$10$YQ8GvFOEJQpHCpVz/VQEhOJQVvQHJp1gVJvJLkZfHpX2iGqZmQiXe', 'OFFICIAL', 'ACTIVE';

  INSERT INTO public.users (full_name, email, password_hash, role, status)
    SELECT 'Lupon User', 'lupon@example.com', '$2a$10$YQ8GvFOEJQpHCpVz/VQEhOJQVvQHJp1gVJvJLkZfHpX2iGqZmQiXe', 'LUPON', 'ACTIVE';

  INSERT INTO public.users (full_name, email, password_hash, role, status)
    SELECT 'Admin User', 'admin@example.com', '$2a$10$YQ8GvFOEJQpHCpVz/VQEhOJQVvQHJp1gVJvJLkZfHpX2iGqZmQiXe', 'ADMIN', 'ACTIVE';

  -- ============================================================================
  -- MIGRATION COMPLETE
  -- ============================================================================
