-- Browser push subscriptions replace Firestore devices. Their endpoint and
-- encryption keys are private operational data, never a public customer field.
create table private.push_devices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  endpoint text not null unique,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (octet_length(subscription::text) <= 4096)
);
create index push_devices_customer_idx on private.push_devices(customer_id);
create function private.register_push_device(p_subscription jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare v_customer uuid := private.require_customer(); v_endpoint text := p_subscription->>'endpoint';
begin
  -- A delivery worker must not become an arbitrary-URL/SSRF proxy.
  if v_endpoint is null or v_endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.services\.mozilla\.com|web\.push\.apple\.com)/[A-Za-z0-9_/?=&.%-]+$' then
    raise exception 'Unsupported web-push endpoint';
  end if;
  if coalesce(p_subscription->'keys'->>'p256dh','') !~ '^[A-Za-z0-9_-]{80,120}={0,2}$'
    or coalesce(p_subscription->'keys'->>'auth','') !~ '^[A-Za-z0-9_-]{20,30}={0,2}$' then raise exception 'Invalid push subscription keys'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_customer::text||':devices',0));
  if not exists(select 1 from private.push_devices where endpoint=v_endpoint and customer_id=v_customer)
    and (select count(*) from private.push_devices where customer_id=v_customer)>=10 then raise exception 'Maximum 10 notification devices per account'; end if;
  insert into private.push_devices(customer_id,endpoint,subscription) values(v_customer,v_endpoint,p_subscription)
    on conflict(endpoint) do update set customer_id=excluded.customer_id,subscription=excluded.subscription,updated_at=now();
end;
$$;
create function public.register_push_device(p_subscription jsonb) returns void language sql security invoker set search_path = '' as $$ select private.register_push_device(p_subscription); $$;
create function private.unregister_push_device(p_endpoint text) returns void language plpgsql security definer set search_path = '' as $$
begin delete from private.push_devices where customer_id=private.require_customer() and endpoint=p_endpoint; end;
$$;
create function public.unregister_push_device(p_endpoint text) returns void language sql security invoker set search_path = '' as $$ select private.unregister_push_device(p_endpoint); $$;
grant execute on function private.register_push_device(jsonb),public.register_push_device(jsonb),private.unregister_push_device(text),public.unregister_push_device(text) to authenticated;
grant all on private.push_devices to service_role;

-- Keep an immutable actor identifier even after auth identity retirement.
-- A cascading SET NULL would otherwise try to mutate an append-only ledger.
alter table public.loyalty_ledger drop constraint loyalty_ledger_actor_user_id_fkey;

-- Additive contract health check: no PII, accessible only after authentication.
create function public.database_contract() returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('application','pearl-energy','schemaVersion',1,'posContractVersion',1,'currency','AUD');
$$;
grant execute on function public.database_contract() to authenticated,service_role;
