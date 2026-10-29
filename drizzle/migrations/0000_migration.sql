-- ==============================================================================
-- SmartAttend — 30-Day Workshop Attendance Portal Database Migration
-- Fully production-ready schema with RLS, triggers, storage, and audit logs.
-- ==============================================================================

-- 1. ENUMS & TYPES
do $$ begin
  create type public.app_role as enum ('super_admin', 'attendance_admin', 'participant');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.verify_status as enum ('pending', 'verified', 'rejected');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.att_status as enum ('present', 'pending', 'excused', 'absent', 'rejected');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.att_method as enum ('qr', 'qr_selfie', 'manual');
exception when duplicate_object then null;
end $$;

-- 2. SEQUENCES
create sequence if not exists public.participant_seq start with 1 increment by 1;

-- 3. PARTICIPANT PROFILES
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  participant_code text unique not null,
  full_name text not null,
  phone text not null,
  email text not null,
  photo_path text,
  verification_status public.verify_status not null default 'pending',
  consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_email_uq on public.profiles (lower(email));
create unique index if not exists profiles_phone_uq on public.profiles (phone);
create index if not exists profiles_verification_status_idx on public.profiles (verification_status);

grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

-- 4. USER ROLES (RBAC)
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create index if not exists user_roles_user_id_idx on public.user_roles (user_id);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

-- Role Helper Functions (Security Definer)
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role in ('super_admin', 'attendance_admin')
  );
$$;

grant execute on function public.has_role(uuid, public.app_role) to authenticated, anon;
grant execute on function public.is_staff(uuid) to authenticated, anon;

-- RLS: user_roles
drop policy if exists "own roles or staff" on public.user_roles;
create policy "own roles or staff" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_staff(auth.uid()));

drop policy if exists "super admin manages roles" on public.user_roles;
create policy "super admin manages roles" on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(), 'super_admin'))
  with check (public.has_role(auth.uid(), 'super_admin'));

-- RLS: profiles
drop policy if exists "own profile or staff" on public.profiles;
create policy "own profile or staff" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff(auth.uid()));

drop policy if exists "staff update profiles" on public.profiles;
create policy "staff update profiles" on public.profiles for update to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists "own photo update" on public.profiles;
create policy "own photo update" on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Trigger to prevent participant from changing protected columns
create or replace function public.protect_profile_cols()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff(auth.uid()) then
    new.verification_status := old.verification_status;
    new.participant_code := old.participant_code;
    new.email := old.email;
    new.id := old.id;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists profiles_protect on public.profiles;
create trigger profiles_protect
  before update on public.profiles
  for each row execute function public.protect_profile_cols();

-- 5. WORKSHOP SETTINGS & WORKSHOPS
create table if not exists public.workshop_settings (
  id int primary key default 1 check (id = 1),
  name text not null default 'SmartAttend 30-Day Workshop',
  start_date date not null default current_date,
  duration_days int not null default 30 check (duration_days between 1 and 120),
  qr_validity_minutes int not null default 15 check (qr_validity_minutes between 1 and 1440),
  require_selfie boolean not null default false,
  low_attendance_threshold int not null default 75 check (low_attendance_threshold between 10 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.workshop_settings (id, name, duration_days)
values (1, 'SmartAttend 30-Day Workshop', 30)
on conflict (id) do nothing;

grant select, update on public.workshop_settings to authenticated;
grant all on public.workshop_settings to service_role;
alter table public.workshop_settings enable row level security;

drop policy if exists "read settings" on public.workshop_settings;
create policy "read settings" on public.workshop_settings for select to authenticated using (true);

drop policy if exists "super admin updates settings" on public.workshop_settings;
create policy "super admin updates settings" on public.workshop_settings for update to authenticated
  using (public.has_role(auth.uid(), 'super_admin'))
  with check (public.has_role(auth.uid(), 'super_admin'));

-- Workshops master table
create table if not exists public.workshops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  start_date date not null default current_date,
  duration_days int not null default 30,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.workshops to authenticated;
grant all on public.workshops to service_role;
alter table public.workshops enable row level security;

drop policy if exists "read workshops" on public.workshops;
create policy "read workshops" on public.workshops for select to authenticated using (true);

drop policy if exists "super admin manages workshops" on public.workshops;
create policy "super admin manages workshops" on public.workshops for all to authenticated
  using (public.has_role(auth.uid(), 'super_admin'))
  with check (public.has_role(auth.uid(), 'super_admin'));

-- 6. WORKSHOP DAYS (Schedule of the 30 days)
create table if not exists public.workshop_days (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid references public.workshops(id) on delete cascade,
  day_number int not null check (day_number between 1 and 120),
  day_date date not null,
  topic text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (day_date)
);

create index if not exists workshop_days_date_idx on public.workshop_days (day_date);
grant select on public.workshop_days to authenticated;
grant all on public.workshop_days to service_role;
alter table public.workshop_days enable row level security;

drop policy if exists "read workshop days" on public.workshop_days;
create policy "read workshop days" on public.workshop_days for select to authenticated using (true);

drop policy if exists "staff manages workshop days" on public.workshop_days;
create policy "staff manages workshop days" on public.workshop_days for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

-- 7. DAILY QR SESSIONS
create table if not exists public.qr_sessions (
  id uuid primary key default gen_random_uuid(),
  day_date date not null,
  token text not null unique,
  short_code text not null,
  expires_at timestamptz not null,
  revoked boolean not null default false,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists qr_sessions_date_idx on public.qr_sessions (day_date);
grant select, insert, update on public.qr_sessions to authenticated;
grant all on public.qr_sessions to service_role;
alter table public.qr_sessions enable row level security;

drop policy if exists "staff qr" on public.qr_sessions;
create policy "staff qr" on public.qr_sessions for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

-- 8. ATTENDANCE RECORDS
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  day_date date not null,
  status public.att_status not null,
  method public.att_method not null,
  selfie_path text,
  qr_session_id uuid references public.qr_sessions(id) on delete set null,
  marked_by uuid references auth.users(id) on delete set null,
  remarks text,
  confidence_score numeric(5,2),
  checked_in_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, day_date)
);

create index if not exists attendance_user_date_idx on public.attendance (user_id, day_date);
create index if not exists attendance_day_date_idx on public.attendance (day_date);
grant select, insert, update, delete on public.attendance to authenticated;
grant all on public.attendance to service_role;
alter table public.attendance enable row level security;

drop policy if exists "own or staff read attendance" on public.attendance;
create policy "own or staff read attendance" on public.attendance for select to authenticated
  using (user_id = auth.uid() or public.is_staff(auth.uid()));

drop policy if exists "staff write attendance" on public.attendance;
create policy "staff write attendance" on public.attendance for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

-- 9. VERIFICATION ATTEMPTS (Face verification / biometric log)
create table if not exists public.verification_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  day_date date not null,
  method text not null default 'face_match',
  reference_photo_path text,
  attempt_photo_path text,
  confidence numeric(5,2),
  match_result boolean,
  status text not null, -- 'matched', 'mismatched', 'pending_manual', 'manual_approved', 'manual_rejected'
  provider text not null default 'server_vision',
  provider_response jsonb,
  created_at timestamptz not null default now()
);

create index if not exists verif_attempts_user_idx on public.verification_attempts (user_id);
create index if not exists verif_attempts_date_idx on public.verification_attempts (day_date);
grant select, insert on public.verification_attempts to authenticated;
grant all on public.verification_attempts to service_role;
alter table public.verification_attempts enable row level security;

drop policy if exists "own or staff read verification attempts" on public.verification_attempts;
create policy "own or staff read verification attempts" on public.verification_attempts for select to authenticated
  using (user_id = auth.uid() or public.is_staff(auth.uid()));

drop policy if exists "insert own verification attempt" on public.verification_attempts;
create policy "insert own verification attempt" on public.verification_attempts for insert to authenticated
  with check (user_id = auth.uid() or public.is_staff(auth.uid()));

-- 10. CONSENT RECORDS (Explicit privacy & biometric consent tracking)
create table if not exists public.consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  consent_type text not null, -- 'privacy_notice', 'biometric_face_verification', 'terms'
  agreed boolean not null default true,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists consent_records_user_idx on public.consent_records (user_id);
grant select, insert on public.consent_records to authenticated;
grant all on public.consent_records to service_role;
alter table public.consent_records enable row level security;

drop policy if exists "own or staff read consent records" on public.consent_records;
create policy "own or staff read consent records" on public.consent_records for select to authenticated
  using (user_id = auth.uid() or public.is_staff(auth.uid()));

drop policy if exists "insert own consent record" on public.consent_records;
create policy "insert own consent record" on public.consent_records for insert to authenticated
  with check (user_id = auth.uid());

-- 11. AUDIT LOGS
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_user uuid references auth.users(id) on delete set null,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_action_idx on public.audit_logs (action);
grant select, insert on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;
alter table public.audit_logs enable row level security;

drop policy if exists "staff read audit" on public.audit_logs;
create policy "staff read audit" on public.audit_logs for select to authenticated
  using (public.is_staff(auth.uid()));

drop policy if exists "staff insert audit" on public.audit_logs;
create policy "staff insert audit" on public.audit_logs for insert to authenticated
  with check (public.is_staff(auth.uid()) and (actor_id = auth.uid() or actor_id is null));

-- 12. STORAGE BUCKETS (Private photos and selfies)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values 
  ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('selfies', 'selfies', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- Storage RLS policies
drop policy if exists "own photo upload" on storage.objects;
create policy "own photo upload" on storage.objects for insert to authenticated
  with check (
    bucket_id in ('photos', 'selfies')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "own photo update obj" on storage.objects;
create policy "own photo update obj" on storage.objects for update to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "own or staff read photos" on storage.objects;
create policy "own or staff read photos" on storage.objects for select to authenticated
  using (
    bucket_id in ('photos', 'selfies')
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_staff(auth.uid())
    )
  );

-- 13. USER REGISTRATION TRIGGER & HELPER FUNCTIONS
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  code text;
  has_admin boolean;
  req_role text;
begin
  code := 'SA-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.participant_seq')::text, 4, '0');
  req_role := coalesce(new.raw_user_meta_data->>'role', 'participant');
  
  insert into public.profiles (
    id,
    participant_code,
    full_name,
    phone,
    email,
    verification_status,
    consent_at
  )
  values (
    new.id,
    code,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'phone', 'unset-' || new.id::text),
    lower(coalesce(new.raw_user_meta_data->>'email', new.email)),
    case when req_role in ('admin', 'attendance_admin', 'super_admin') then 'verified'::public.verify_status else 'pending'::public.verify_status end,
    case when new.raw_user_meta_data->>'consent' = 'true' then now() else null end
  );

  -- Determine role: first user is super_admin; admin registration gets attendance_admin; others get participant
  select exists (select 1 from public.user_roles where role = 'super_admin') into has_admin;
  if not has_admin then
    insert into public.user_roles (user_id, role) values (new.id, 'super_admin');
  elsif req_role in ('admin', 'attendance_admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'attendance_admin');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'participant');
  end if;

  -- Record consent if provided
  if new.raw_user_meta_data->>'consent' = 'true' then
    insert into public.consent_records (user_id, consent_type, agreed)
    values (new.id, 'privacy_policy_and_face_verification', true);
  end if;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Duplicate verification check function for registration
create or replace function public.registration_taken(_email text, _phone text)
returns text language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.profiles where lower(email) = lower(_email)) then 'email'
    when exists (select 1 from public.profiles where phone = _phone) then 'phone'
    else null
  end;
$$;

grant execute on function public.registration_taken(text, text) to anon, authenticated;
