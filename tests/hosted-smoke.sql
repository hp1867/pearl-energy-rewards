-- Authorized operator only. Run the WHOLE file in one database session.
-- Tests real PostgreSQL roles/RPCs, not the Auth HTTP/SMTP/Edge gateways.
-- Fixtures never commit or send email. Sequence gaps after ROLLBACK are normal.
begin;
set local statement_timeout = '20s';

create temporary table pearl_smoke_fixture (
  member_uid uuid default gen_random_uuid(),
  other_uid uuid default gen_random_uuid(),
  station_id text default 'smoke-' || gen_random_uuid()::text,
  integration_id uuid default gen_random_uuid(),
  payload jsonb
);
insert into pearl_smoke_fixture default values;
grant select on pearl_smoke_fixture to authenticated, service_role;

insert into auth.users(id,email,email_confirmed_at)
select member_uid,member_uid::text || '@example.invalid',now() from pearl_smoke_fixture
union all
select other_uid,other_uid::text || '@example.invalid',now() from pearl_smoke_fixture;

set local role authenticated;
select set_config('request.jwt.claim.sub',(select member_uid::text from pearl_smoke_fixture),true);
do $$
declare member_id uuid;
begin
  member_id := public.ensure_profile('{}');
  if member_id is distinct from public.ensure_profile('{}') then
    raise exception 'Profile creation is not idempotent';
  end if;
  if (select count(*) from public.customers) <> 1 then
    raise exception 'Customer RLS did not isolate the signed-in member';
  end if;
  begin
    update public.loyalty_accounts set balance=999999 where customer_id=member_id;
    raise exception 'Customer was allowed to write a points balance';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from private.staff_access;
    raise exception 'Customer was allowed to read private staff records';
  exception when insufficient_privilege then null;
  end;
  if public.staff_session() is not null then
    raise exception 'Ordinary member unexpectedly has staff access';
  end if;
end $$;
reset role;

insert into public.stations(id,name)
select station_id,'ROLLBACK ONLY - database smoke test' from pearl_smoke_fixture;
insert into private.pos_integrations(id,provider,station_id,external_store_id,active)
select integration_id,'hosted-smoke',station_id,station_id,true from pearl_smoke_fixture;
update pearl_smoke_fixture f set payload = jsonb_build_object(
  'contractVersion',1,'provider','hosted-smoke','eventId',gen_random_uuid(),
  'eventType','sale','externalTransactionId',gen_random_uuid(),
  'occurredAt',now(),'businessDate',(now() at time zone 'Australia/Sydney')::date,
  'storeId',f.station_id,'terminalId','smoke','receiptNumber','ROLLBACK-ONLY',
  'currency','AUD','subtotalCents',10000,'taxCents',909,'totalCents',10000,
  -- The Edge contract normalizes hyphens before calling the database RPC.
  'membershipCode',(select replace(membership_code,'-','') from public.customers where auth_user_id=f.member_uid),
  'items',jsonb_build_array(jsonb_build_object('lineId','1','description','Test shop purchase',
    'category','snacks','quantityMilli',1000,'unitPriceMicros',100000000,
    'totalCents',10000,'eligibleForPoints',true)),
  'payments',jsonb_build_array(jsonb_build_object('method','card','amountCents',10000))
);

set local role service_role;
select set_config('request.jwt.claim.sub','',true);
do $$
declare f record; first_result jsonb; retry_result jsonb;
begin
  select * into strict f from pearl_smoke_fixture;
  first_result := public.record_pos(f.integration_id,f.payload,repeat('a',64));
  retry_result := public.record_pos(f.integration_id,f.payload,repeat('a',64));
  if retry_result->>'transactionId' is distinct from first_result->>'transactionId'
    or retry_result->>'duplicate' is distinct from 'true' then
    raise exception 'POS retry created a different result';
  end if;
  if (select count(*) from public.transactions where integration_id=f.integration_id) <> 1 then
    raise exception 'POS retry created another receipt';
  end if;
  if not exists (
    select 1 from public.loyalty_accounts a join public.customers c on c.id=a.customer_id
    where c.auth_user_id=f.member_uid and a.balance>0
  ) then raise exception 'POS sale did not award points'; end if;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub',(select other_uid::text from pearl_smoke_fixture),true);
select public.ensure_profile('{}');
do $$ begin
  if (select count(*) from public.customers) <> 1
    or exists(select 1 from public.transactions)
    or exists(select 1 from public.loyalty_ledger) then
    raise exception 'Another customer can read the first member''s history';
  end if;
end $$;
reset role;

do $$ begin
  if exists (
    select a.customer_id from public.loyalty_accounts a
    join public.customers c on c.id=a.customer_id
    left join public.loyalty_ledger l on l.customer_id=a.customer_id
    where c.auth_user_id in (select member_uid from pearl_smoke_fixture)
    group by a.customer_id,a.balance having a.balance<>coalesce(sum(l.delta),0)
  ) then raise exception 'Points balance does not reconcile to the ledger'; end if;
end $$;
rollback;
select true as hosted_smoke_passed;
