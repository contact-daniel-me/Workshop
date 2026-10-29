-- ==============================================================================
-- SmartAttend — Public Phone Lookup RPC
-- Secure function allowing unauthenticated or authenticated users to lookup their registration details by phone.
-- ==============================================================================

create or replace function public.lookup_profile_by_phone(_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  clean_phone text;
  digits text;
  prof record;
  user_role text := 'participant';
  res jsonb;
begin
  if _phone is null or trim(_phone) = '' then
    return jsonb_build_object('found', false, 'message', 'Enter a valid 10-digit mobile number.');
  end if;

  digits := regexp_replace(_phone, '[^0-9]', '', 'g');
  if length(digits) = 10 then
    clean_phone := digits;
  elsif length(digits) = 11 and digits like '0%' then
    clean_phone := substring(digits from 2);
  elsif length(digits) = 12 and digits like '91%' then
    clean_phone := substring(digits from 3);
  else
    clean_phone := digits;
  end if;

  -- 1. Find profile by phone (matching raw digits, or exact match)
  select
    p.id,
    p.participant_code,
    p.full_name,
    p.phone,
    p.email,
    p.photo_path,
    p.verification_status,
    p.created_at
  into prof
  from public.profiles p
  where p.phone = clean_phone
     or p.phone = '+91' || clean_phone
     or p.phone = '91' || clean_phone
     or regexp_replace(p.phone, '[^0-9]', '', 'g') = clean_phone
  limit 1;

  if prof.id is null then
    return jsonb_build_object('found', false, 'message', 'No registered account found with that mobile number.');
  end if;

  -- 2. Determine highest role
  if exists (select 1 from public.user_roles ur where ur.user_id = prof.id and ur.role = 'super_admin') then
    user_role := 'super_admin';
  elsif exists (select 1 from public.user_roles ur where ur.user_id = prof.id and ur.role = 'attendance_admin') then
    user_role := 'attendance_admin';
  else
    user_role := 'participant';
  end if;

  -- 3. Build response
  res := jsonb_build_object(
    'found', true,
    'profile', jsonb_build_object(
      'id', prof.id,
      'fullName', prof.full_name,
      'participantCode', prof.participant_code,
      'phone', prof.phone,
      'email', prof.email,
      'verificationStatus', prof.verification_status,
      'createdAt', prof.created_at,
      'photoPath', prof.photo_path,
      'role', user_role
    )
  );

  return res;
end;
$$;

grant execute on function public.lookup_profile_by_phone(text) to anon, authenticated, service_role;
