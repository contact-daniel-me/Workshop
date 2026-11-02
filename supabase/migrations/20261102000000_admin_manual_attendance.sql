-- ==============================================================================
-- SmartAttend — Admin Manual Attendance Management & Reset System Migration
-- Adds morning and afternoon session attendance tracking columns and indexes.
-- ==============================================================================

-- 1. Add session-specific attendance status columns to public.attendance
alter table public.attendance
  add column if not exists morning_status text default null,
  add column if not exists afternoon_status text default null;

-- 2. Backfill existing verified present attendance records to have both sessions present
update public.attendance
set morning_status = 'present',
    afternoon_status = 'present'
where status = 'present'
  and morning_status is null
  and afternoon_status is null;

-- 3. Create helpful indexes for session status queries
create index if not exists attendance_morning_status_idx on public.attendance (morning_status);
create index if not exists attendance_afternoon_status_idx on public.attendance (afternoon_status);

-- 4. Audit Log index enhancement for manual and bulk attendance actions
create index if not exists audit_logs_target_user_idx on public.audit_logs (target_user);

