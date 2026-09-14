-- Signed register lookup is intentionally smaller than an admin customer view:
-- no email, mobile, DOB, preferences, auth identity or transaction history.
create function private.pos_member(p_integration_id uuid,p_membership_code text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_customer public.customers; v_points bigint;
begin
  if not exists(select 1 from private.pos_integrations p join public.stations s on s.id=p.station_id where p.id=p_integration_id and p.active and s.active) then
    raise exception 'POS integration is not authorised' using errcode='42501';
  end if;
  select * into v_customer from public.customers where status='active' and (replace(membership_code,'-','')=p_membership_code or customer_number::text=p_membership_code);
  if not found then raise exception 'Membership not found'; end if;
  select balance into v_points from public.loyalty_accounts where customer_id=v_customer.id;
  return jsonb_build_object('customerNumber',v_customer.customer_number::text,'membershipId',v_customer.membership_code,'firstName',v_customer.first_name,'points',v_points,
    'coupons',coalesce((select jsonb_agg(jsonb_build_object('id',id,'rewardId',reward_id,'title',title,'expiresAt',expires_at))
      from public.coupons where customer_id=v_customer.id and status='active' and expires_at>now()),'[]'));
end;
$$;
create function public.pos_member(p_integration_id uuid,p_membership_code text) returns jsonb language sql security invoker set search_path = '' as $$ select private.pos_member(p_integration_id,p_membership_code); $$;
grant execute on function private.pos_member(uuid,text),public.pos_member(uuid,text) to service_role;

-- Positive limits and lookup indexes are part of the POS boundary.
create index customers_number_text_idx on public.customers((customer_number::text));
alter table public.transactions add constraint tax_not_above_total check (tax_cents<=total_cents);

-- Operational, lease-based push delivery. Failed deliveries retry independently
-- from financial writes; they can never roll back a purchase.
create table private.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references private.push_devices(id) on delete cascade,
  notification_id text not null, notification_version int not null,
  state text not null default 'pending' check (state in ('pending','processing','delivered','failed')),
  attempts int not null default 0, available_at timestamptz not null default now(),
  lease_until timestamptz, created_at timestamptz not null default now(),
  unique(device_id,notification_id,notification_version)
);
create index push_deliveries_queue_idx on private.push_deliveries(available_at) where state in ('pending','failed','processing');
create function private.claim_push_batch() returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  insert into private.push_deliveries(device_id,notification_id,notification_version)
    select d.id,n.id,n.version from public.catalog_items n join private.push_devices d on d.created_at<=n.updated_at
    where n.kind='notifs' and n.active and n.updated_at>now()-interval '7 days'
      and not exists(select 1 from private.push_deliveries x where x.device_id=d.id and x.notification_id=n.id and x.notification_version=n.version)
    order by n.updated_at,d.id limit 100 on conflict do nothing;
  with candidates as (
    select d.id from private.push_deliveries d
      join public.catalog_items n on n.kind='notifs' and n.id=d.notification_id and n.version=d.notification_version and n.active
      where d.attempts<5 and d.available_at<=now()
      and (d.state in ('pending','failed') or (d.state='processing' and d.lease_until<now())) order by d.available_at,d.id limit 10 for update of d skip locked
  ), claimed as (
    update private.push_deliveries d set state='processing',attempts=attempts+1,lease_until=now()+interval '2 minutes'
      from candidates c where d.id=c.id returning d.*
  ) select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'attempt',c.attempts,'subscription',d.subscription,'notificationId',c.notification_id,'body',left(coalesce(n.data->>'body',n.title),200))),'[]') into v_result
    from claimed c join private.push_devices d on d.id=c.device_id join public.catalog_items n on n.kind='notifs' and n.id=c.notification_id;
  return v_result;
end;
$$;
create function public.claim_push_batch() returns jsonb language sql security invoker set search_path = '' as $$ select private.claim_push_batch(); $$;
create function private.finish_push(p_id uuid,p_attempt int,p_success boolean,p_gone boolean default false) returns void language plpgsql security definer set search_path = '' as $$
declare v_device uuid;
begin
  -- A late worker cannot acknowledge or delete a subscription after another
  -- worker reclaimed its expired lease.
  select device_id into v_device from private.push_deliveries where id=p_id and state='processing' and attempts=p_attempt for update;
  if not found then return; end if;
  if p_gone then delete from private.push_devices where id=v_device;
  else update private.push_deliveries set state=case when p_success then 'delivered' else 'failed' end,
    available_at=now()+make_interval(secs=>least(3600,30*power(2,attempts)::int)),lease_until=null where id=p_id;
  end if;
end;
$$;
create function public.finish_push(p_id uuid,p_attempt int,p_success boolean,p_gone boolean default false) returns void language sql security invoker set search_path = '' as $$ select private.finish_push(p_id,p_attempt,p_success,p_gone); $$;
grant execute on function private.claim_push_batch(),public.claim_push_batch(),private.finish_push(uuid,int,boolean,boolean),public.finish_push(uuid,int,boolean,boolean) to service_role;
grant all on private.push_deliveries to service_role;
