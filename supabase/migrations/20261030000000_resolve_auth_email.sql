-- ==============================================================================
-- SmartAttend — Resolve Login Identifier (Email or Phone) to Auth Email
-- Secure server-side function mapping email or phone to Supabase Auth user email.
-- ==============================================================================

create or replace function public.resolve_auth_email(_identifier text)
returns text language plpgsql security definer set search_path = public, auth as $$
declare
  clean_id text;
  digits text;
  mapped_phone text;
  auth_email text;
  user_uuid uuid;
begin
  clean_id := trim(_identifier);
  if clean_id = '' or clean_id is null then
    return null;
  end if;

  if clean_id like '%@%' then
    -- It is an email address.
    -- 1. Check if an account in public.profiles has this email.
    select p.id, p.phone into user_uuid, mapped_phone
    from public.profiles p
    where lower(p.email) = lower(clean_id)
    limit 1;

    if user_uuid is not null then
      -- Retrieve the corresponding auth.users login email
      select u.email into auth_email
      from auth.users u
      where u.id = user_uuid;

      if auth_email is not null then
        return auth_email;
      end if;

      if mapped_phone is not null and mapped_phone not like 'unset-%' then
        return mapped_phone || '@smartattend.in';
      end if;
    end if;

    -- 2. If not found in profiles, check if directly in auth.users
    select u.email into auth_email
    from auth.users u
    where lower(u.email) = lower(clean_id)
    limit 1;

    if auth_email is not null then
      return auth_email;
    end if;

    -- Return the clean email so Supabase Auth validates and returns generic credential error
    return lower(clean_id);
  else
    -- It is a phone number.
    digits := regexp_replace(clean_id, '[^0-9]', '', 'g');
    if length(digits) = 12 and digits like '91%' then
      digits := substr(digits, 3);
    elsif length(digits) = 11 and digits like '0%' then
      digits := substr(digits, 2);
    end if;

    -- Check if a profile exists with this phone
    select p.id into user_uuid
    from public.profiles p
    where p.phone = digits
    limit 1;

    if user_uuid is not null then
      select u.email into auth_email
      from auth.users u
      where u.id = user_uuid;

      if auth_email is not null then
        return auth_email;
      end if;
    end if;

    return digits || '@smartattend.in';
  end if;
end;
$$;

grant execute on function public.resolve_auth_email(text) to anon, authenticated;

