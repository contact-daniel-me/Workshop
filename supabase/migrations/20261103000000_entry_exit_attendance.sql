-- Migration: 20261103000000_entry_exit_attendance.sql
-- Description: Transition from Morning/Afternoon session labels to Entry and Exit Attendance.
-- Backward compatibility guaranteed: Maps Entry Attendance to morning_status and Exit Attendance to afternoon_status.

-- 1. Document column roles for Entry and Exit Attendance
COMMENT ON COLUMN public.attendance.morning_status IS 'Entry attendance status (arrival check-in). Values: present, absent, null';
COMMENT ON COLUMN public.attendance.afternoon_status IS 'Exit attendance status (departure check-out). Values: present, absent, null';
COMMENT ON COLUMN public.attendance.checked_in_at IS 'Arrival Entry timestamp recorded in UTC.';
COMMENT ON COLUMN public.attendance.updated_at IS 'Last update / Exit timestamp recorded in UTC.';

-- 2. Create index to accelerate Entry and Exit status queries
CREATE INDEX IF NOT EXISTS idx_attendance_day_entry_exit 
  ON public.attendance(day_date, morning_status, afternoon_status);

-- 3. Create view for seamless Entry / Exit reporting if queried by reporting tools
CREATE OR REPLACE VIEW public.v_attendance_entry_exit AS
SELECT 
  a.id,
  a.user_id,
  p.full_name,
  p.participant_code,
  p.phone,
  p.email,
  a.day_date,
  COALESCE(a.morning_status, CASE WHEN a.status = 'present' THEN 'present' ELSE 'absent' END) AS entry_status,
  a.checked_in_at AS entry_time,
  COALESCE(a.afternoon_status, 'absent') AS exit_status,
  a.updated_at AS exit_time,
  a.status AS overall_status,
  a.method,
  a.remarks
FROM public.attendance a
JOIN public.profiles p ON p.id = a.user_id;

