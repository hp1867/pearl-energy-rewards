-- One verified email and one verified phone per loyalty membership.
-- Auth owns credentials/OTP. A typed, unique phone also protects domain data.
create function private.normalise_phone(p_value text) returns text language plpgsql immutable set search_path='' as $$
declare v text:=regexp_replace(trim(coalesce(p_value,'')),'[[:space:]().-]','','g');
begin
  if v ~ '^04[0-9]{8}$' then v:='+61'||substr(v,2);
  elsif v ~ '^614[0-9]{8}$' then v:='+'||v;
  elsif v ~ '^[1-9][0-9]{7,14}$' then v:='+'||v; end if;
  if v !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Enter a valid mobile number with country code' using errcode='22023'; end if;
  return v;
end;
$$;

-- No silent merge, deletion or guessed ownership during migration.
do $$ begin
  if exists(select 1 from public.customers where mobile<>'') then
    if exists(select private.normalise_phone(mobile) from public.customers where mobile<>'' group by 1 having count(*)>1) then
      raise exception 'Existing phone collision: migration stopped without changing accounts';
    end if;
    update public.customers set mobile=private.normalise_phone(mobile) where mobile<>'';
  end if;
end $$;
create unique index customers_mobile_unique on public.customers(mobile) where mobile<>'';
alter table public.customers drop constraint customers_status_check;
alter table public.customers add constraint customers_status_check check(status in ('pending','active','suspended','closed'));
alter table public.customers alter column status set default 'pending';

create table public.policy_versions (
  kind text not null check(kind in ('terms','privacy','closure')),
  version text not null check(length(version) between 1 and 60),
  body text not null check(length(trim(body)) between 50 and 100000),
  published_at timestamptz not null default clock_timestamp(),
  published_by uuid,
  primary key(kind,version)
);
create index policy_versions_current_idx on public.policy_versions(kind,published_at desc);
create table public.consent_events (
  id bigint generated always as identity primary key,
  customer_id uuid not null references public.customers(id),
  purpose text not null check(purpose in ('terms','privacy','marketing')),
  decision text not null check(decision in ('accepted','withdrawn')),
  policy_kind text not null,
  policy_version text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  actor_user_id uuid not null,
  foreign key(policy_kind,policy_version) references public.policy_versions(kind,version),
  check((purpose in ('terms','privacy') and purpose=policy_kind) or (purpose='marketing' and policy_kind='privacy'))
);
create index consent_events_member_idx on public.consent_events(customer_id,recorded_at desc,id desc);
create index consent_events_policy_idx on public.consent_events(policy_kind,policy_version);
create table private.account_closures (
  customer_id uuid primary key references public.customers(id),
  requested_by uuid not null,
  closed_at timestamptz not null default now(),
  policy_kind text not null default 'closure' check(policy_kind='closure'),
  disclosure_version text not null,
  balance_at_closure bigint not null,
  foreign key(policy_kind,disclosure_version) references public.policy_versions(kind,version)
);
alter table public.policy_versions enable row level security;
alter table public.consent_events enable row level security;
alter table private.account_closures enable row level security;
revoke all on public.policy_versions,public.consent_events,private.account_closures from public,anon,authenticated;
grant select on public.policy_versions to anon,authenticated;
grant select on public.consent_events to authenticated;
grant all on public.policy_versions,public.consent_events,private.account_closures to service_role;
grant usage,select on sequence public.consent_events_id_seq to service_role;
create policy policy_versions_read on public.policy_versions for select to anon,authenticated using(true);
create policy consent_events_read on public.consent_events for select to authenticated using(customer_id=(select private.customer_id()) or (select private.is_admin()));
create trigger policy_versions_immutable before update or delete on public.policy_versions for each row execute function private.immutable_record();
create trigger consent_events_immutable before update or delete on public.consent_events for each row execute function private.immutable_record();
create trigger account_closures_immutable before update or delete on private.account_closures for each row execute function private.immutable_record();

create function private.verified_member_phone() returns text language plpgsql stable security definer set search_path='' as $$
declare v_phone text; v_email text; v_email_at timestamptz; v_phone_at timestamptz;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode='42501'; end if;
  select email,phone,email_confirmed_at,phone_confirmed_at into v_email,v_phone,v_email_at,v_phone_at from auth.users where id=auth.uid();
  if nullif(v_email,'') is null or v_email_at is null then raise exception 'Verify your email before activating membership' using errcode='42501'; end if;
  if nullif(v_phone,'') is null or v_phone_at is null then raise exception 'Verify your mobile number before activating membership' using errcode='42501'; end if;
  return private.normalise_phone(v_phone);
end;
$$;

create function private.provision_member(p_fields jsonb default '{}') returns uuid language plpgsql security definer set search_path='' as $$
declare v_phone text:=private.verified_member_phone(); v_user uuid:=auth.uid(); v_meta jsonb; v_id uuid; v_status text;
begin
  select raw_user_meta_data into v_meta from auth.users where id=v_user;
  insert into public.customers(auth_user_id,first_name,last_name,mobile,dob,status)
    values(v_user,left(coalesce(p_fields->>'firstName',v_meta->>'firstName',v_meta->>'given_name',''),80),
      left(coalesce(p_fields->>'lastName',v_meta->>'lastName',v_meta->>'family_name',''),80),v_phone,nullif(coalesce(p_fields->>'dob',v_meta->>'dob'),'')::date,'pending')
    on conflict(auth_user_id) do nothing;
  select id,status into v_id,v_status from public.customers where auth_user_id=v_user for update;
  if v_status not in ('active','pending') then raise exception 'This account is not active' using errcode='42501'; end if;
  update public.customers set mobile=v_phone where id=v_id and mobile<>v_phone;
  insert into public.loyalty_accounts(customer_id) values(v_id) on conflict do nothing;
  return v_id;
exception when unique_violation then
  raise exception 'This mobile number cannot be used for another membership. Use your existing account.' using errcode='23505';
end;
$$;
create or replace function private.ensure_profile(p_fields jsonb default '{}') returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid:=private.provision_member(p_fields);
begin
  if not exists(select 1 from public.customers where id=v_id and status='active') then raise exception 'Complete membership registration first' using errcode='42501'; end if;
  return v_id;
end;
$$;

create or replace function private.customer_id() returns uuid language sql stable security definer set search_path='' as $$
  select c.id from public.customers c join auth.users u on u.id=c.auth_user_id
    where c.auth_user_id=(select auth.uid()) and c.status='active' and u.email_confirmed_at is not null
      and nullif(u.email,'') is not null and u.phone_confirmed_at is not null and c.mobile='+'||ltrim(u.phone,'+');
$$;

create function private.member_onboarding() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_user auth.users; v_customer public.customers;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode='42501'; end if;
  select * into strict v_user from auth.users where id=auth.uid();
  select * into v_customer from public.customers where auth_user_id=v_user.id;
  if v_customer.status in ('closed','suspended') then raise exception 'This account is not active' using errcode='42501'; end if;
  return jsonb_build_object('needsEmail',v_user.email_confirmed_at is null or nullif(v_user.email,'') is null,
    'needsPhone',v_user.phone_confirmed_at is null or nullif(v_user.phone,'') is null,
    'needsConsent',v_customer.id is null or v_customer.status='pending');
end;
$$;
create function public.member_onboarding() returns jsonb language sql security invoker set search_path='' as $$ select private.member_onboarding(); $$;

create function private.complete_registration(p_versions jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid:=private.provision_member(); v_kind text; v_policy public.policy_versions;
begin
  for v_kind in select unnest(array['terms','privacy']) loop
    select * into v_policy from public.policy_versions where kind=v_kind order by published_at desc limit 1;
    if not found then raise exception 'Pearl Energy must publish its membership terms and privacy notice before registration can finish'; end if;
    if p_versions->>v_kind is distinct from v_policy.version then raise exception 'The policy has changed. Read and accept the latest version.'; end if;
    if not exists(select 1 from public.consent_events where customer_id=v_id and purpose=v_kind and policy_version=v_policy.version and decision='accepted') then
      insert into public.consent_events(customer_id,purpose,decision,policy_kind,policy_version,actor_user_id)
        values(v_id,v_kind,'accepted',v_kind,v_policy.version,auth.uid());
    end if;
  end loop;
  update public.customers set status='active',updated_at=now() where id=v_id;
  return v_id;
end;
$$;
create function public.complete_registration(p_versions jsonb) returns uuid language sql security invoker set search_path='' as $$ select private.complete_registration(p_versions); $$;

create or replace function private.update_profile(p_fields jsonb) returns void language plpgsql security definer set search_path='' as $$
declare v_id uuid:=private.require_customer(); v_current public.customers;
begin
  select * into strict v_current from public.customers where id=v_id for update;
  if jsonb_typeof(p_fields)<>'object' or exists(select 1 from jsonb_object_keys(p_fields) k where k not in ('firstName','lastName','mobile','dob','preferences')) then raise exception 'Unsupported profile fields'; end if;
  if p_fields ? 'mobile' and private.normalise_phone(p_fields->>'mobile')<>v_current.mobile then raise exception 'Phone changes require SMS verification in Account settings'; end if;
  if p_fields ? 'preferences' and (p_fields->'preferences' ? 'marketing') and p_fields->'preferences'->'marketing' is distinct from v_current.preferences->'marketing' then raise exception 'Use the consent setting to change marketing preferences'; end if;
  update public.customers set first_name=coalesce(p_fields->>'firstName',first_name),last_name=coalesce(p_fields->>'lastName',last_name),
    dob=case when p_fields ? 'dob' then nullif(p_fields->>'dob','')::date else dob end,
    preferences=preferences||coalesce(p_fields->'preferences','{}'),updated_at=now() where id=v_id;
end;
$$;

create function private.set_marketing_consent(p_accepted boolean,p_request_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_id uuid:=private.require_customer(); v_policy public.policy_versions; v_prior private.idempotency_keys;
begin
  if p_accepted is null or p_request_id is null then raise exception 'Consent choice and request ID are required'; end if;
  perform 1 from public.customers where id=v_id for update;
  select * into v_prior from private.idempotency_keys where actor_id=auth.uid() and operation='marketing_consent' and request_id=p_request_id;
  if found then
    if v_prior.payload<>jsonb_build_object('accepted',p_accepted) then raise exception 'Request ID reused with a different choice'; end if;
    return;
  end if;
  select * into v_policy from public.policy_versions where kind='privacy' order by published_at desc limit 1;
  if not found then raise exception 'Privacy notice has not been published'; end if;
  insert into public.consent_events(customer_id,purpose,decision,policy_kind,policy_version,actor_user_id)
    values(v_id,'marketing',case when p_accepted then 'accepted' else 'withdrawn' end,'privacy',v_policy.version,auth.uid());
  update public.customers set preferences=jsonb_set(preferences,'{marketing}',to_jsonb(p_accepted)),updated_at=now() where id=v_id;
  insert into private.idempotency_keys values(auth.uid(),'marketing_consent',p_request_id,jsonb_build_object('accepted',p_accepted),'{}',now());
end;
$$;
create function public.set_marketing_consent(p_accepted boolean,p_request_id uuid) returns void language sql security invoker set search_path='' as $$ select private.set_marketing_consent(p_accepted,p_request_id); $$;

create function private.publish_policy(p_kind text,p_version text,p_body text) returns void language plpgsql security definer set search_path='' as $$
begin
  perform private.require_admin();
  insert into public.policy_versions(kind,version,body,published_by) values(p_kind,trim(p_version),trim(p_body),auth.uid());
  insert into private.audit_logs(actor_user_id,action,target_id,detail) values(auth.uid(),'policy.publish',p_kind||':'||p_version,'{}');
end;
$$;
create function public.publish_policy(p_kind text,p_version text,p_body text) returns void language sql security invoker set search_path='' as $$ select private.publish_policy(p_kind,p_version,p_body); $$;

create function private.close_my_account(p_confirmation text,p_disclosure_version text) returns void language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_balance bigint; v_policy public.policy_versions;
begin
  select id into v_id from public.customers where auth_user_id=auth.uid() for update;
  if v_id is null then raise exception 'Membership not found' using errcode='42501'; end if;
  if exists(select 1 from private.account_closures where customer_id=v_id) then return; end if;
  if p_confirmation is distinct from 'CLOSE' then raise exception 'Type CLOSE to confirm'; end if;
  select * into v_policy from public.policy_versions where kind='closure' order by published_at desc limit 1;
  if not found or v_policy.version is distinct from p_disclosure_version then raise exception 'Read and accept the current account closure disclosure'; end if;
  select balance into v_balance from public.loyalty_accounts where customer_id=v_id for update;
  insert into private.account_closures(customer_id,requested_by,disclosure_version,balance_at_closure) values(v_id,auth.uid(),v_policy.version,v_balance);
  update public.customers set status='closed',updated_at=now() where id=v_id;
  update public.coupons set status='revoked' where customer_id=v_id and status in ('active','held');
  insert into private.audit_logs(actor_user_id,action,target_id,detail) values(auth.uid(),'account.close',v_id::text,jsonb_build_object('disclosureVersion',v_policy.version,'noTransfer',true));
end;
$$;
create function public.close_my_account(p_confirmation text,p_disclosure_version text) returns void language sql security invoker set search_path='' as $$ select private.close_my_account(p_confirmation,p_disclosure_version); $$;

-- Internal provisioning and OTP checks are not browser APIs.
revoke execute on function private.normalise_phone(text),private.verified_member_phone(),private.provision_member(jsonb) from public,anon,authenticated;
grant execute on function private.member_onboarding(),public.member_onboarding(),private.complete_registration(jsonb),public.complete_registration(jsonb),
  private.set_marketing_consent(boolean,uuid),public.set_marketing_consent(boolean,uuid),private.publish_policy(text,text,text),public.publish_policy(text,text,text),
  private.close_my_account(text,text),public.close_my_account(text,text) to authenticated;

create table private.account_recovery_requests (
  id uuid primary key, customer_id uuid not null references public.customers(id), actor_user_id uuid not null,
  state text not null default 'pending' check(state in ('pending','sent','failed')),
  created_at timestamptz not null default now(), finished_at timestamptz, error_code text
);
create index recovery_customer_time_idx on private.account_recovery_requests(customer_id,created_at desc);
create index recovery_actor_time_idx on private.account_recovery_requests(actor_user_id,created_at desc);
alter table private.account_recovery_requests enable row level security;
revoke all on private.account_recovery_requests from public,anon,authenticated;
grant all on private.account_recovery_requests to service_role;

create function private.begin_member_recovery(p_customer_id uuid,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_request private.account_recovery_requests; v_email text;
begin
  perform private.require_admin();
  if p_request_id is null then raise exception 'Request ID is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('recovery:'||auth.uid()::text,0));
  select u.email into v_email from public.customers c join auth.users u on u.id=c.auth_user_id
    where c.id=p_customer_id and c.status in ('active','pending') and u.email_confirmed_at is not null for update of c;
  if v_email is null then raise exception 'An active account with a verified email is required'; end if;
  select * into v_request from private.account_recovery_requests where id=p_request_id;
  if found then
    if v_request.customer_id<>p_customer_id or v_request.actor_user_id<>auth.uid() then raise exception 'Request ID reused for another account' using errcode='23505'; end if;
    return jsonb_build_object('shouldSend',false,'requestId',p_request_id,'state',v_request.state);
  end if;
  if exists(select 1 from private.account_recovery_requests where customer_id=p_customer_id and created_at>now()-interval '1 minute')
    or (select count(*) from private.account_recovery_requests where actor_user_id=auth.uid() and created_at>now()-interval '1 hour')>=20 then
    raise exception 'Recovery rate limit reached. Wait before retrying.';
  end if;
  insert into private.account_recovery_requests(id,customer_id,actor_user_id) values(p_request_id,p_customer_id,auth.uid());
  insert into private.audit_logs(actor_user_id,action,target_id,detail) values(auth.uid(),'account.recovery_requested',p_customer_id::text,jsonb_build_object('requestId',p_request_id,'destination','existing_verified_email'));
  return jsonb_build_object('shouldSend',true,'requestId',p_request_id,'email',v_email,'state','pending');
end;
$$;
create function public.begin_member_recovery(p_customer_id uuid,p_request_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.begin_member_recovery(p_customer_id,p_request_id); $$;
grant execute on function private.begin_member_recovery(uuid,uuid),public.begin_member_recovery(uuid,uuid) to authenticated;

create function private.finish_member_recovery(p_request_id uuid,p_success boolean,p_error_code text) returns void language plpgsql security definer set search_path='' as $$
begin
  update private.account_recovery_requests set state=case when p_success then 'sent' else 'failed' end,finished_at=now(),error_code=left(p_error_code,80)
    where id=p_request_id and state='pending';
  if found then insert into private.audit_logs(action,target_id,detail) values('account.recovery_result',p_request_id::text,jsonb_build_object('acceptedByEmailService',p_success,'errorCode',left(p_error_code,80))); end if;
end;
$$;
create function public.finish_member_recovery(p_request_id uuid,p_success boolean,p_error_code text) returns void language sql security invoker set search_path='' as $$ select private.finish_member_recovery(p_request_id,p_success,p_error_code); $$;
grant execute on function private.finish_member_recovery(uuid,boolean,text),public.finish_member_recovery(uuid,boolean,text) to service_role;

create or replace function private.admin_customers(p_search text default '',p_offset int default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_phone text;
begin
  perform private.require_admin();
  if p_offset<0 or length(p_search)>200 then raise exception 'Invalid pagination'; end if;
  begin v_phone:=private.normalise_phone(p_search); exception when invalid_parameter_value then v_phone:=null; end;
  return coalesce((select jsonb_agg(to_jsonb(r)) from (
    select c.*,u.email,a.balance,a.lifetime_points from public.customers c left join auth.users u on u.id=c.auth_user_id join public.loyalty_accounts a on a.customer_id=c.id
    where p_search='' or c.customer_number::text=p_search or c.membership_code=p_search or (c.first_name||' '||c.last_name) ilike '%'||p_search||'%' or u.email ilike '%'||p_search||'%' or c.mobile=v_phone
    order by c.created_at desc,c.id limit 100 offset p_offset
  ) r),'[]');
end;
$$;
