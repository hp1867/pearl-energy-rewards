-- Owner-requested email-first registration. SMS is deferred, not faked.
-- Preserve all verified phone identities, unique indexes, consent and history.
create or replace function private.provision_member(p_fields jsonb default '{}') returns uuid language plpgsql security definer set search_path='' as $$
declare v_user auth.users; v_phone text:=''; v_id uuid; v_status text;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode='42501'; end if;
  select * into strict v_user from auth.users where id=auth.uid();
  if nullif(v_user.email,'') is null or v_user.email_confirmed_at is null then
    raise exception 'Verify your email before completing sign-up' using errcode='42501';
  end if;
  if v_user.phone_confirmed_at is not null and nullif(v_user.phone,'') is not null then
    v_phone:=private.normalise_phone(v_user.phone);
  end if;
  -- Do not claim/reserve somebody's phone using unverified editable metadata.
  insert into public.customers(auth_user_id,first_name,last_name,mobile,dob,status)
    values(v_user.id,left(coalesce(p_fields->>'firstName',v_user.raw_user_meta_data->>'firstName',v_user.raw_user_meta_data->>'given_name',''),80),
      left(coalesce(p_fields->>'lastName',v_user.raw_user_meta_data->>'lastName',v_user.raw_user_meta_data->>'family_name',''),80),
      v_phone,nullif(coalesce(p_fields->>'dob',v_user.raw_user_meta_data->>'dob'),'')::date,'pending')
    on conflict(auth_user_id) do nothing;
  select id,status into v_id,v_status from public.customers where auth_user_id=v_user.id for update;
  if v_status not in ('active','pending') then raise exception 'This account is not active' using errcode='42501'; end if;
  if v_phone<>'' then update public.customers set mobile=v_phone where id=v_id and mobile<>v_phone; end if;
  insert into public.loyalty_accounts(customer_id) values(v_id) on conflict do nothing;
  return v_id;
exception when unique_violation then
  raise exception 'This verified mobile number belongs to another membership. Use your existing account.' using errcode='23505';
end;
$$;

create or replace function private.customer_id() returns uuid language sql stable security definer set search_path='' as $$
  select c.id from public.customers c join auth.users u on u.id=c.auth_user_id
    where c.auth_user_id=(select auth.uid()) and c.status='active'
      and nullif(u.email,'') is not null and u.email_confirmed_at is not null;
$$;

-- Membership activation and policy acceptance are separate. No invented consent
-- for documents that were not displayed; no SMS or policy-publication login gate.
create or replace function private.member_onboarding() returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_user auth.users; v_customer public.customers; v_versions jsonb; v_current jsonb; v_id uuid; v_consent_warning boolean:=false;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode='42501'; end if;
  select * into strict v_user from auth.users where id=auth.uid();
  select * into v_customer from public.customers where auth_user_id=v_user.id;
  if v_customer.status in ('closed','suspended') then raise exception 'This account is not active' using errcode='42501'; end if;
  select jsonb_object_agg(kind,version) into v_current from (
    select distinct on(kind) kind,version from public.policy_versions where kind in ('terms','privacy') order by kind,published_at desc
  ) p;
  v_versions:=v_user.raw_user_meta_data->'registrationConsent';
  if v_user.email_confirmed_at is not null and nullif(v_user.email,'') is not null then
    v_id:=private.provision_member();
    update public.customers set status='active',updated_at=now() where id=v_id and status='pending';
    if v_current ? 'terms' and v_current ? 'privacy'
      and v_versions->>'terms'=v_current->>'terms' and v_versions->>'privacy'=v_current->>'privacy'
      and (select count(distinct purpose) from public.consent_events where customer_id=v_id
        and purpose in ('terms','privacy') and decision='accepted' and policy_version=v_versions->>purpose)<2 then
      begin
        perform private.complete_registration(v_versions);
      exception when others then
        -- Policy publication can race sign-in. Keep activation; never assert
        -- that a failed acknowledgement was saved. The UI exposes this notice.
        v_consent_warning:=true;
      end;
    end if;
  end if;
  return jsonb_build_object('needsEmail',v_user.email_confirmed_at is null or nullif(v_user.email,'') is null,
    'needsPhone',false,'needsConsent',false,'consentWarning',v_consent_warning,
    'needsPolicies',not coalesce(v_current ? 'terms' and v_current ? 'privacy',false));
end;
$$;
create or replace function public.member_onboarding() returns jsonb language sql volatile security invoker set search_path='' as $$ select private.member_onboarding(); $$;
