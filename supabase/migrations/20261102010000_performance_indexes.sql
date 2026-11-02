-- ==============================================================================
-- SmartAttend — High-Performance Composite & Partial Indexes Migration
-- Optimizes daily lookups, active QR session checks, and audit log queries.
-- ==============================================================================

-- 1. Optimized attendance filtering by date and status (Used heavily by admin dashboards)
create index if not exists attendance_day_status_idx
  on public.attendance (day_date, status);

create index if not exists attendance_user_status_idx
  on public.attendance (user_id, status);

-- 2. Partial index for active, unrevoked QR sessions (Used in active QR lookups)
create index if not exists qr_sessions_active_lookup_idx
  on public.qr_sessions (day_date, expires_at desc)
  where revoked = false;

-- 3. Composite index for audit logs sorted by action and timestamp
create index if not exists audit_logs_action_created_idx
  on public.audit_logs (action, created_at desc);

-- 4. Composite index for profiles by verification status and participant code
create index if not exists profiles_verification_code_idx
  on public.profiles (verification_status, participant_code);

