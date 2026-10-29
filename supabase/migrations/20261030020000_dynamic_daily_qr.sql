-- ==============================================================================
-- SmartAttend — Dynamic Daily QR Code Attendance System
-- Secure, production-grade schema migration for participant-bound daily QR tokens.
-- ==============================================================================

-- 1. EXTEND att_method ENUM
do $$ begin
  alter type public.att_method add value if not exists 'qr_scan';
exception when others then null;
end $$;

-- 2. EXTEND qr_sessions TABLE
alter table public.qr_sessions 
  add column if not exists participant_id uuid references public.profiles(id) on delete cascade,
  add column if not exists workshop_id uuid references public.workshops(id) on delete set null,
  add column if not exists token_hash text,
  add column if not exists issued_at timestamptz not null default now(),
  add column if not exists used_at timestamptz,
  add column if not exists revoked_at timestamptz;

create index if not exists qr_sessions_participant_day_idx on public.qr_sessions (participant_id, day_date);
create index if not exists qr_sessions_token_hash_idx on public.qr_sessions (token_hash);
create index if not exists qr_sessions_token_idx on public.qr_sessions (token);
create index if not exists qr_sessions_short_code_idx on public.qr_sessions (short_code);

-- 3. RLS POLICIES FOR qr_sessions
drop policy if exists "participants read own qr" on public.qr_sessions;
create policy "participants read own qr" on public.qr_sessions for select to authenticated
  using (participant_id = auth.uid() or public.is_staff(auth.uid()));

drop policy if exists "staff manage qr_sessions" on public.qr_sessions;
create policy "staff manage qr_sessions" on public.qr_sessions for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

-- 4. FUNCTION: get_or_create_participant_qr
create or replace function public.get_or_create_participant_qr(_participant_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_id uuid := auth.uid();
  today_date date;
  prof record;
  settings record;
  active_session record;
  new_token text;
  new_token_hash text;
  new_short_code text;
  new_expires timestamptz;
  new_id uuid;
  is_w_day boolean := false;
  already_att record;
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  -- 1. Caller authorization check
  if caller_id is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED', 'message', 'You must be logged in.');
  end if;

  if _participant_id is null then
    _participant_id := caller_id;
  end if;

  if caller_id != _participant_id and not public.is_staff(caller_id) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Cannot generate QR for another participant.');
  end if;

  -- 2. Verify participant profile and approval status
  select * into prof from public.profiles where id = _participant_id;
  if prof.id is null then
    return jsonb_build_object('ok', false, 'code', 'NO_PROFILE', 'message', 'Participant profile not found.');
  end if;

  if prof.verification_status != 'verified' then
    return jsonb_build_object(
      'ok', false,
      'code', 'NOT_APPROVED',
      'status', prof.verification_status,
      'message', case 
        when prof.verification_status = 'rejected' then 'Your registration has been rejected. No attendance QR will be issued.'
        else 'Your account is pending administrator approval. No attendance QR can be generated until verified.'
      end
    );
  end if;

  -- 3. Determine official session date in workshop timezone (Asia/Kolkata)
  today_date := (now() at time zone 'Asia/Kolkata')::date;

  -- 4. Verify workshop settings and eligible workshop day
  select * into settings from public.workshop_settings where id = 1;
  if settings.id is not null then
    if today_date >= settings.start_date and today_date < (settings.start_date + settings.duration_days) then
      is_w_day := true;
    end if;
  end if;

  if not is_w_day then
    return jsonb_build_object(
      'ok', false,
      'code', 'NO_SESSION_SCHEDULED',
      'dayDate', today_date,
      'message', 'No workshop session scheduled for today.'
    );
  end if;

  -- 5. Check if already marked present today
  select * into already_att from public.attendance where user_id = _participant_id and day_date = today_date;
  if already_att.id is not null then
    return jsonb_build_object(
      'ok', true,
      'code', 'ALREADY_PRESENT',
      'alreadyMarked', true,
      'status', already_att.status,
      'checkedInAt', already_att.checked_in_at,
      'dayDate', today_date,
      'message', 'Attendance already marked for today.'
    );
  end if;

  -- 6. Check existing valid, unused session
  select * into active_session 
  from public.qr_sessions 
  where participant_id = _participant_id 
    and day_date = today_date 
    and revoked = false 
    and revoked_at is null 
    and used_at is null
    and expires_at > (now() + interval '30 seconds')
  order by created_at desc 
  limit 1;

  if active_session.id is not null then
    return jsonb_build_object(
      'ok', true,
      'code', 'ACTIVE_QR',
      'reused', true,
      'sessionId', active_session.id,
      'token', active_session.token,
      'shortCode', active_session.short_code,
      'expiresAt', active_session.expires_at,
      'dayDate', active_session.day_date,
      'message', 'Active QR session retrieved.'
    );
  end if;

  -- 7. Revoke any older expired sessions for today
  update public.qr_sessions 
  set revoked = true, revoked_at = coalesce(revoked_at, now())
  where participant_id = _participant_id and day_date = today_date and revoked = false and used_at is null;

  -- 8. Generate cryptographically strong random token
  new_token := encode(gen_random_bytes(24), 'hex');
  new_token_hash := encode(digest(new_token, 'sha256'), 'hex');

  -- Generate 6-char short code
  new_short_code := 
    substr(chars, 1 + (floor(random() * 32))::int, 1) ||
    substr(chars, 1 + (floor(random() * 32))::int, 1) ||
    substr(chars, 1 + (floor(random() * 32))::int, 1) ||
    substr(chars, 1 + (floor(random() * 32))::int, 1) ||
    substr(chars, 1 + (floor(random() * 32))::int, 1) ||
    substr(chars, 1 + (floor(random() * 32))::int, 1);

  new_expires := now() + ((coalesce(settings.qr_validity_minutes, 15)) || ' minutes')::interval;

  insert into public.qr_sessions (
    participant_id,
    day_date,
    token,
    token_hash,
    short_code,
    issued_at,
    expires_at,
    revoked,
    created_by
  ) values (
    _participant_id,
    today_date,
    new_token,
    new_token_hash,
    new_short_code,
    now(),
    new_expires,
    false,
    caller_id
  ) returning id into new_id;

  -- Audit log entry
  insert into public.audit_logs (actor_id, target_user, action, details)
  values (caller_id, _participant_id, 'qr_token_generated', jsonb_build_object(
    'sessionId', new_id,
    'dayDate', today_date,
    'expiresAt', new_expires
  ));

  return jsonb_build_object(
    'ok', true,
    'code', 'ACTIVE_QR',
    'reused', false,
    'sessionId', new_id,
    'token', new_token,
    'shortCode', new_short_code,
    'expiresAt', new_expires,
    'dayDate', today_date,
    'message', 'New attendance QR token issued.'
  );
end;
$$;

grant execute on function public.get_or_create_participant_qr(uuid) to authenticated;

-- 5. FUNCTION: verify_participant_qr
create or replace function public.verify_participant_qr(_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_id uuid := auth.uid();
  clean_token text;
  token_h text;
  session_rec record;
  prof record;
  today_date date;
  att_rec record;
begin
  if caller_id is null or not public.is_staff(caller_id) then
    return jsonb_build_object('valid', false, 'resultCode', 'UNAUTHORIZED', 'resultMessage', 'Only authorized administrators can verify QR codes.');
  end if;

  clean_token := trim(_token);
  if clean_token = '' or clean_token is null then
    return jsonb_build_object('valid', false, 'resultCode', 'INVALID_QR', 'resultMessage', 'Invalid QR code.');
  end if;

  token_h := encode(digest(clean_token, 'sha256'), 'hex');
  today_date := (now() at time zone 'Asia/Kolkata')::date;

  -- Find QR session by token or token_hash or short_code
  select * into session_rec
  from public.qr_sessions
  where token = clean_token 
     or token_hash = token_h 
     or short_code = upper(clean_token)
  order by created_at desc
  limit 1;

  if session_rec.id is null then
    return jsonb_build_object('valid', false, 'resultCode', 'INVALID_QR', 'resultMessage', 'Invalid QR — Token not found or unrecognized.');
  end if;

  if session_rec.participant_id is null then
    return jsonb_build_object('valid', false, 'resultCode', 'INVALID_QR', 'resultMessage', 'QR is not bound to a participant.');
  end if;

  -- Load participant profile
  select * into prof from public.profiles where id = session_rec.participant_id;
  if prof.id is null then
    return jsonb_build_object('valid', false, 'resultCode', 'INVALID_QR', 'resultMessage', 'Participant profile not found.');
  end if;

  -- Check if participant is approved
  if prof.verification_status != 'verified' then
    return jsonb_build_object(
      'valid', false,
      'resultCode', 'PARTICIPANT_NOT_APPROVED',
      'resultMessage', 'Participant Not Approved — Registration status is ' || prof.verification_status || '.',
      'participant', jsonb_build_object(
        'id', prof.id,
        'fullName', prof.full_name,
        'participantCode', prof.participant_code,
        'email', prof.email,
        'phone', prof.phone,
        'photoPath', prof.photo_path,
        'verificationStatus', prof.verification_status
      )
    );
  end if;

  -- Check if revoked
  if session_rec.revoked = true or session_rec.revoked_at is not null then
    return jsonb_build_object('valid', false, 'resultCode', 'QR_REVOKED', 'resultMessage', 'QR Revoked — This QR code has been revoked.');
  end if;

  -- Check if already used
  if session_rec.used_at is not null then
    return jsonb_build_object('valid', false, 'resultCode', 'QR_ALREADY_USED', 'resultMessage', 'QR Already Used — This code has already been scanned and consumed.');
  end if;

  -- Check expiration
  if session_rec.expires_at < now() then
    return jsonb_build_object('valid', false, 'resultCode', 'QR_EXPIRED', 'resultMessage', 'QR Expired — The validity window for this QR code has ended.');
  end if;

  -- Check date
  if session_rec.day_date != today_date then
    return jsonb_build_object(
      'valid', false,
      'resultCode', 'WRONG_DATE',
      'resultMessage', 'Wrong Workshop or Date — This QR is for ' || session_rec.day_date || ', but today is ' || today_date || '.'
    );
  end if;

  -- Check if attendance already marked
  select * into att_rec from public.attendance where user_id = prof.id and day_date = today_date;
  if att_rec.id is not null then
    return jsonb_build_object(
      'valid', false,
      'resultCode', 'ATTENDANCE_ALREADY_MARKED',
      'resultMessage', 'Attendance Already Marked — Participant is already recorded as ' || upper(att_rec.status::text) || ' for today.',
      'participant', jsonb_build_object(
        'id', prof.id,
        'fullName', prof.full_name,
        'participantCode', prof.participant_code,
        'email', prof.email,
        'phone', prof.phone,
        'photoPath', prof.photo_path,
        'verificationStatus', prof.verification_status
      ),
      'attendance', jsonb_build_object(
        'id', att_rec.id,
        'status', att_rec.status,
        'checkedInAt', att_rec.checked_in_at,
        'method', att_rec.method
      )
    );
  end if;

  -- Valid QR Ready to mark
  return jsonb_build_object(
    'valid', true,
    'resultCode', 'READY_TO_MARK',
    'resultMessage', 'Valid QR — Ready to Mark Attendance',
    'participant', jsonb_build_object(
      'id', prof.id,
      'fullName', prof.full_name,
      'participantCode', prof.participant_code,
      'email', prof.email,
      'phone', prof.phone,
      'photoPath', prof.photo_path,
      'verificationStatus', prof.verification_status
    ),
    'session', jsonb_build_object(
      'id', session_rec.id,
      'dayDate', session_rec.day_date,
      'expiresAt', session_rec.expires_at,
      'token', clean_token
    )
  );
end;
$$;

grant execute on function public.verify_participant_qr(text) to authenticated;

-- 6. FUNCTION: confirm_participant_attendance
create or replace function public.confirm_participant_attendance(_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_id uuid := auth.uid();
  clean_token text;
  token_h text;
  session_rec record;
  prof record;
  today_date date;
  att_rec record;
  new_att_id uuid;
begin
  if caller_id is null or not public.is_staff(caller_id) then
    return jsonb_build_object('ok', false, 'resultCode', 'UNAUTHORIZED', 'message', 'Only authorized administrators can confirm attendance.');
  end if;

  clean_token := trim(_token);
  token_h := encode(digest(clean_token, 'sha256'), 'hex');
  today_date := (now() at time zone 'Asia/Kolkata')::date;

  -- Lock session row to prevent concurrent consumption
  select * into session_rec
  from public.qr_sessions
  where token = clean_token 
     or token_hash = token_h 
     or short_code = upper(clean_token)
  for update;

  if session_rec.id is null then
    return jsonb_build_object('ok', false, 'resultCode', 'INVALID_QR', 'message', 'Invalid QR code.');
  end if;

  if session_rec.used_at is not null then
    return jsonb_build_object('ok', false, 'resultCode', 'QR_ALREADY_USED', 'message', 'This QR code has already been consumed.');
  end if;

  if session_rec.revoked = true or session_rec.revoked_at is not null then
    return jsonb_build_object('ok', false, 'resultCode', 'QR_REVOKED', 'message', 'This QR code has been revoked.');
  end if;

  if session_rec.expires_at < now() then
    return jsonb_build_object('ok', false, 'resultCode', 'QR_EXPIRED', 'message', 'This QR code has expired.');
  end if;

  if session_rec.day_date != today_date then
    return jsonb_build_object('ok', false, 'resultCode', 'WRONG_DATE', 'message', 'This QR is not valid for today.');
  end if;

  -- Load and check participant
  select * into prof from public.profiles where id = session_rec.participant_id;
  if prof.id is null or prof.verification_status != 'verified' then
    return jsonb_build_object('ok', false, 'resultCode', 'NOT_APPROVED', 'message', 'Participant is not approved.');
  end if;

  -- Check existing attendance
  select * into att_rec from public.attendance where user_id = prof.id and day_date = today_date;
  if att_rec.id is not null then
    return jsonb_build_object(
      'ok', false,
      'resultCode', 'ALREADY_MARKED',
      'message', 'Attendance Already Marked',
      'attendance', jsonb_build_object('id', att_rec.id, 'status', att_rec.status, 'checkedInAt', att_rec.checked_in_at)
    );
  end if;

  -- Insert attendance atomically
  insert into public.attendance (
    user_id,
    day_date,
    status,
    method,
    qr_session_id,
    marked_by,
    remarks,
    checked_in_at
  ) values (
    prof.id,
    today_date,
    'present',
    'qr_scan',
    session_rec.id,
    caller_id,
    'Verified via Admin QR Scanner',
    now()
  ) returning id into new_att_id;

  -- Mark session as consumed
  update public.qr_sessions
  set used_at = now()
  where id = session_rec.id;

  -- Record audit log
  insert into public.audit_logs (actor_id, target_user, action, details)
  values (caller_id, prof.id, 'attendance_confirmed_qr_scan', jsonb_build_object(
    'dayDate', today_date,
    'sessionId', session_rec.id,
    'attendanceId', new_att_id,
    'method', 'qr_scan'
  ));

  return jsonb_build_object(
    'ok', true,
    'resultCode', 'CONFIRMED',
    'message', 'Attendance marked successfully',
    'participant', jsonb_build_object(
      'id', prof.id,
      'fullName', prof.full_name,
      'participantCode', prof.participant_code,
      'email', prof.email,
      'phone', prof.phone,
      'photoPath', prof.photo_path
    ),
    'attendance', jsonb_build_object(
      'id', new_att_id,
      'status', 'present',
      'checkedInAt', now(),
      'dayDate', today_date,
      'method', 'qr_scan'
    )
  );
end;
$$;

grant execute on function public.confirm_participant_attendance(text) to authenticated;

