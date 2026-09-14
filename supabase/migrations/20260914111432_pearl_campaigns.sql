-- Versioned campaign rules. Prize changes require a new version/migration.
create table public.campaigns (
  id text primary key check (id in ('fuel_mission','shop_wheel')),
  version int not null default 1, active boolean not null default true,
  config jsonb not null, updated_at timestamptz not null default now()
);
insert into public.campaigns(id,config) values
('fuel_mission','{"target":4,"windowDays":14,"prizes":[{"type":"points","value":100,"label":"100 Bonus Points","img":"⭐","weight":40},{"type":"points","value":200,"label":"200 Bonus Points","img":"⚡","weight":25},{"type":"points","value":500,"label":"500 Bonus Points","img":"💎","weight":10},{"type":"coupon","label":"Free Regular Coffee","img":"☕","color":"#7a4a2b","weight":20},{"type":"coupon","label":"Free Snack","img":"🍫","color":"#8e44ad","weight":5}]}'),
('shop_wheel','{"minimumSpendCents":5000,"categories":["lollies","snacks","biscuits","bakery"],"prizes":[{"id":"disc5","label":"5% Off","img":"🏷️","color":"#0057b8","weight":25,"type":"coupon","title":"5% Off Next Purchase"},{"id":"drink","label":"Free Drink","img":"🥤","color":"#16a085","weight":20,"type":"coupon","title":"Free Drink (600ml)"},{"id":"double","label":"Double Points","img":"⚡","color":"#f39c12","weight":20,"type":"double"},{"id":"gift","label":"Mystery Gift","img":"🎁","color":"#8e44ad","weight":10,"type":"coupon","title":"Mystery Gift — reveal in store"},{"id":"entries","label":"5 Draw Entries","img":"🎟️","color":"#c0392b","weight":25,"type":"entries","value":5}]}');

create table public.campaign_awards (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  campaign_id text not null references public.campaigns(id), campaign_version int not null,
  source_transaction_id uuid not null references public.transactions(id),
  prize jsonb not null, coupon_id uuid references public.coupons(id),
  applied_transaction_id uuid references public.transactions(id),
  bonus_points int not null default 0 check (bonus_points >= 0),
  reversed_points int not null default 0 check (reversed_points between 0 and bonus_points),
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);
create index awards_customer_idx on public.campaign_awards(customer_id,created_at desc);
create index awards_source_idx on public.campaign_awards(source_transaction_id);
create index awards_applied_idx on public.campaign_awards(applied_transaction_id);
create index awards_campaign_idx on public.campaign_awards(campaign_id);
create index awards_coupon_idx on public.campaign_awards(coupon_id);
create table public.wheel_credits (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.customers(id),
  transaction_id uuid not null unique references public.transactions(id),
  state text not null default 'available' check (state in ('available','spent','revoked')),
  award_id uuid references public.campaign_awards(id), created_at timestamptz not null default now()
);
create index wheel_customer_idx on public.wheel_credits(customer_id,state,created_at);
create index wheel_award_idx on public.wheel_credits(award_id);
create table public.mission_cycles (
  id uuid primary key default gen_random_uuid(),customer_id uuid not null references public.customers(id),
  starts_at timestamptz not null,ends_at timestamptz not null,award_id uuid references public.campaign_awards(id),
  check (ends_at>starts_at)
);
create index mission_customer_idx on public.mission_cycles(customer_id,starts_at desc);
create index mission_award_idx on public.mission_cycles(award_id);
create table public.mission_contributions (
  transaction_id uuid primary key references public.transactions(id),
  cycle_id uuid not null references public.mission_cycles(id),customer_id uuid not null references public.customers(id),
  revoked boolean not null default false
);
create index mission_contributions_cycle_idx on public.mission_contributions(cycle_id);
create index mission_contributions_customer_idx on public.mission_contributions(customer_id);
create table private.promotion_reviews (
  id uuid primary key default gen_random_uuid(),customer_id uuid not null references public.customers(id),
  award_id uuid not null unique references public.campaign_awards(id),
  reason text not null, resolved_at timestamptz, resolved_by uuid, resolution text,
  created_at timestamptz not null default now()
);
create index promotion_reviews_customer_idx on private.promotion_reviews(customer_id) where resolved_at is null;

alter table public.campaigns enable row level security;
revoke all on public.campaigns from anon,authenticated;
grant select on public.campaigns to authenticated;
create policy campaigns_read on public.campaigns for select to authenticated using (true);
do $$ declare t text; begin
  foreach t in array array['campaign_awards','wheel_credits','mission_cycles','mission_contributions'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy own_read on public.%I for select to authenticated using (customer_id=(select private.customer_id()) or (select private.is_admin()))',t);
  end loop;
end $$;

create function private.draw_prize(p_prizes jsonb) returns jsonb language plpgsql volatile set search_path = '' as $$
declare v_roll numeric; v_prize jsonb; v_total int;
begin
  select sum((value->>'weight')::int) into v_total from jsonb_array_elements(p_prizes);
  -- UUID randomness comes from PostgreSQL's cryptographic random source.
  v_roll := (('x'||substr(replace(gen_random_uuid()::text,'-',''),1,8))::bit(32)::bigint)::numeric/4294967296*v_total;
  for v_prize in select value from jsonb_array_elements(p_prizes) loop
    v_roll := v_roll-(v_prize->>'weight')::int;
    if v_roll<0 then return v_prize; end if;
  end loop;
  raise exception 'Invalid prize configuration';
end;
$$;
create function private.issue_prize(p_customer uuid,p_campaign text,p_source uuid) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_campaign public.campaigns; v_prize jsonb; v_award uuid := gen_random_uuid(); v_coupon uuid; v_points int := 0;
begin
  select * into strict v_campaign from public.campaigns where id=p_campaign and active;
  v_prize := private.draw_prize(v_campaign.config->'prizes');
  if v_prize->>'type'='coupon' then
    insert into public.coupons(customer_id,title,cost_points,display)
      values(p_customer,coalesce(v_prize->>'title',v_prize->>'label'),0,v_prize||jsonb_build_object('cat','Campaign prize')) returning id into v_coupon;
  elsif v_prize->>'type'='points' then
    v_points := (v_prize->>'value')::int;
    insert into public.loyalty_ledger(customer_id,transaction_id,entry_type,delta,lifetime_delta,balance_after,operation_key,reason)
      values(p_customer,p_source,'prize',v_points,v_points,0,'prize:'||v_award,v_prize->>'label');
  end if;
  insert into public.campaign_awards(id,customer_id,campaign_id,campaign_version,source_transaction_id,prize,coupon_id,bonus_points)
    values(v_award,p_customer,p_campaign,v_campaign.version,p_source,v_prize,v_coupon,v_points);
  insert into private.audit_logs(action,target_id,detail) values('campaign.award',v_award::text,jsonb_build_object('customerId',p_customer,'campaign',p_campaign));
  return v_award;
end;
$$;

create function private.spin_wheel(p_request_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_customer uuid := private.require_customer(); v_credit public.wheel_credits; v_award uuid; v_result jsonb;
begin
  if p_request_id is null then raise exception 'A request ID is required'; end if;
  perform 1 from public.loyalty_accounts where customer_id=v_customer for update;
  select result into v_result from private.idempotency_keys where actor_id=auth.uid() and operation='spin' and request_id=p_request_id;
  if found then return v_result; end if;
  if exists(select 1 from private.promotion_reviews where customer_id=v_customer and resolved_at is null) then raise exception 'A refunded promotion needs staff review before another spin'; end if;
  if not exists(select 1 from public.campaigns where id='shop_wheel' and active) then raise exception 'Spin & Win is currently paused'; end if;
  select * into v_credit from public.wheel_credits where customer_id=v_customer and state='available' order by created_at,id limit 1 for update;
  if not found then raise exception 'No spins available'; end if;
  v_award := private.issue_prize(v_customer,'shop_wheel',v_credit.transaction_id);
  update public.wheel_credits set state='spent',award_id=v_award where id=v_credit.id;
  select jsonb_build_object('ok',true,'prize',prize) into v_result from public.campaign_awards where id=v_award;
  insert into private.idempotency_keys values(auth.uid(),'spin',p_request_id,'{}',v_result,now());
  return v_result;
end;
$$;
create function public.spin_wheel(p_request_id uuid) returns jsonb language sql security invoker set search_path = '' as $$ select private.spin_wheel(p_request_id); $$;
grant execute on function private.spin_wheel(uuid),public.spin_wheel(uuid) to authenticated;

create function private.campaign_status() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_customer uuid := private.require_customer(); v_cycle public.mission_cycles;
begin
  select * into v_cycle from public.mission_cycles where customer_id=v_customer and ends_at>now() order by starts_at desc,id limit 1;
  return jsonb_build_object('missionActive',(select active from public.campaigns where id='fuel_mission'),
    'wheelActive',(select active from public.campaigns where id='shop_wheel'),
    'missionCount',(select count(*) from public.mission_contributions where cycle_id=v_cycle.id and not revoked),
    'missionStart',v_cycle.starts_at,'missionPrize',(select prize from public.campaign_awards where id=v_cycle.award_id and not revoked),
    'wheelSpins',(select count(*) from public.wheel_credits where customer_id=v_customer and state='available'),
    'promotionHold',exists(select 1 from private.promotion_reviews where customer_id=v_customer and resolved_at is null),
    'monthlyDrawEntries',(select coalesce(sum((prize->>'value')::int),0) from public.campaign_awards where customer_id=v_customer and not revoked and prize->>'type'='entries'
      and date_trunc('month',created_at at time zone 'Australia/Sydney')=date_trunc('month',now() at time zone 'Australia/Sydney')),
    'doublePointsNext',exists(select 1 from public.campaign_awards where customer_id=v_customer and not revoked and prize->>'type'='double' and applied_transaction_id is null));
end;
$$;
create function public.campaign_status() returns jsonb language sql security invoker set search_path = '' as $$ select private.campaign_status(); $$;
grant execute on function private.campaign_status(),public.campaign_status() to authenticated;

-- Decorate the core POS transaction inside the SAME database transaction.
-- A failed campaign write therefore cannot leave a half-posted purchase.
alter function private.record_pos(uuid,jsonb,text) rename to record_pos_core;
create function private.record_pos(p_integration_id uuid,p_event jsonb,p_payload_hash text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb; v_tx public.transactions; v_award public.campaign_awards; v_campaign public.campaigns; v_cycle public.mission_cycles;
  v_bonus int; v_hold boolean; v_count int; v_award_id uuid; v_coupon public.coupons; v_source_refund boolean;
begin
  v_result := private.record_pos_core(p_integration_id,p_event,p_payload_hash);
  if (v_result->>'duplicate')::boolean then return v_result; end if;
  select * into strict v_tx from public.transactions where id=(v_result->>'transactionId')::uuid;
  if v_tx.customer_id is null then return v_result; end if;
  perform 1 from public.loyalty_accounts where customer_id=v_tx.customer_id for update;
  v_hold := exists(select 1 from private.promotion_reviews where customer_id=v_tx.customer_id and resolved_at is null);
  if v_tx.event_type='sale' and not v_hold then
    -- Only one saved multiplier applies to one purchase; additional multipliers
    -- remain queued. Award links allow later refunds to reverse exactly once.
    if v_tx.points_delta>0 then
      select * into v_award from public.campaign_awards where customer_id=v_tx.customer_id and prize->>'type'='double'
        and not revoked and applied_transaction_id is null order by created_at,id limit 1 for update;
      if found then
        insert into public.loyalty_ledger(customer_id,transaction_id,entry_type,delta,lifetime_delta,balance_after,operation_key,reason)
          values(v_tx.customer_id,v_tx.id,'prize',v_tx.points_delta,v_tx.points_delta,0,'double:'||v_award.id,'Double-points prize');
        update public.campaign_awards set applied_transaction_id=v_tx.id,bonus_points=v_tx.points_delta where id=v_award.id;
      end if;
    end if;
    select * into v_campaign from public.campaigns where id='shop_wheel' and active;
    if found and (
      (select coalesce(sum(total_cents),0) from public.transaction_items where transaction_id=v_tx.id and fuel_grade is null and eligible_for_points)>=(v_campaign.config->>'minimumSpendCents')::int
      or exists(select 1 from public.transaction_items where transaction_id=v_tx.id and eligible_for_points and total_cents>0 and category in (select jsonb_array_elements_text(v_campaign.config->'categories')))
    ) then insert into public.wheel_credits(customer_id,transaction_id) values(v_tx.customer_id,v_tx.id); end if;
    select * into v_campaign from public.campaigns where id='fuel_mission' and active;
    if found and exists(select 1 from public.transaction_items where transaction_id=v_tx.id and litres_milli>0 and total_cents>0)
      and v_tx.occurred_at>=now()-interval '14 days' then
      select * into v_cycle from public.mission_cycles where customer_id=v_tx.customer_id and starts_at<=v_tx.occurred_at and ends_at>v_tx.occurred_at and award_id is null order by starts_at desc,id limit 1 for update;
      if not found then
        insert into public.mission_cycles(customer_id,starts_at,ends_at) values(v_tx.customer_id,v_tx.occurred_at,v_tx.occurred_at+make_interval(days=>(v_campaign.config->>'windowDays')::int)) returning * into v_cycle;
      end if;
      insert into public.mission_contributions values(v_tx.id,v_cycle.id,v_tx.customer_id,false);
      select count(*) into v_count from public.mission_contributions where cycle_id=v_cycle.id and not revoked;
      if v_count>=(v_campaign.config->>'target')::int then
        v_award_id := private.issue_prize(v_tx.customer_id,'fuel_mission',v_tx.id);
        update public.mission_cycles set award_id=v_award_id where id=v_cycle.id;
      end if;
    end if;
  elsif v_tx.event_type<>'sale' then
    -- Any refund invalidates that receipt's campaign qualification. Ordinary
    -- loyalty points are still reversed proportionally by the core processor.
    update public.wheel_credits set state='revoked' where transaction_id=v_tx.original_transaction_id;
    update public.mission_contributions set revoked=true where transaction_id=v_tx.original_transaction_id;
    for v_award in select * from public.campaign_awards where customer_id=v_tx.customer_id and (
      source_transaction_id=v_tx.original_transaction_id or applied_transaction_id=v_tx.original_transaction_id
      or id in (select c.award_id from public.mission_cycles c join public.mission_contributions m on m.cycle_id=c.id where m.transaction_id=v_tx.original_transaction_id)
    ) order by id for update loop
      v_source_refund := v_award.source_transaction_id=v_tx.original_transaction_id or v_award.campaign_id='fuel_mission';
      if v_source_refund then v_bonus := v_award.bonus_points-v_award.reversed_points;
      else v_bonus := least(abs(v_tx.points_delta),v_award.bonus_points-v_award.reversed_points); end if;
      if v_bonus>0 then
        insert into public.loyalty_ledger(customer_id,transaction_id,entry_type,delta,lifetime_delta,balance_after,operation_key,reason)
          values(v_tx.customer_id,v_tx.id,'refund',-v_bonus,-v_bonus,0,'prize-refund:'||v_tx.id||':'||v_award.id,'Refunded promotional bonus');
      end if;
      update public.campaign_awards set reversed_points=reversed_points+v_bonus,revoked=revoked or v_source_refund where id=v_award.id;
      if v_source_refund and v_award.coupon_id is not null then
        select * into v_coupon from public.coupons where id=v_award.coupon_id for update;
        if v_coupon.status='active' then update public.coupons set status='revoked' where id=v_coupon.id;
        elsif v_coupon.status='redeemed' then
          insert into private.promotion_reviews(customer_id,award_id,reason) values(v_tx.customer_id,v_award.id,'A refunded qualifying purchase has an already-consumed promotional coupon') on conflict(award_id) do nothing;
        end if;
      end if;
    end loop;
  end if;
  return v_result;
end;
$$;
create or replace function public.record_pos(p_integration_id uuid,p_event jsonb,p_payload_hash text) returns jsonb language sql security invoker set search_path = '' as $$ select private.record_pos(p_integration_id,p_event,p_payload_hash); $$;
revoke all on function private.record_pos(uuid,jsonb,text),public.record_pos(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function private.record_pos(uuid,jsonb,text),public.record_pos(uuid,jsonb,text) to service_role;

create function private.manage_campaign(p_id text,p_active boolean) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  update public.campaigns set active=p_active,updated_at=now() where id=p_id;
  if not found then raise exception 'Campaign not found'; end if;
  insert into private.audit_logs(actor_user_id,action,target_id,detail) values(auth.uid(),'campaign.state',p_id,jsonb_build_object('active',p_active));
end;
$$;
create function public.manage_campaign(p_id text,p_active boolean) returns void language sql security invoker set search_path = '' as $$ select private.manage_campaign(p_id,p_active); $$;
create function private.promotion_reviews() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin perform private.require_admin(); return coalesce((select jsonb_agg(to_jsonb(r)) from (select * from private.promotion_reviews where resolved_at is null order by created_at limit 100) r),'[]'); end;
$$;
create function public.promotion_reviews() returns jsonb language sql security invoker set search_path = '' as $$ select private.promotion_reviews(); $$;
create function private.resolve_promotion_review(p_id uuid,p_reason text) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_admin();
  if p_reason is null or length(trim(p_reason)) not between 5 and 500 then raise exception 'A resolution of 5–500 characters is required'; end if;
  update private.promotion_reviews set resolved_at=now(),resolved_by=auth.uid(),resolution=p_reason where id=p_id and resolved_at is null;
  insert into private.audit_logs(actor_user_id,action,target_id,detail) values(auth.uid(),'promotion.review',p_id::text,jsonb_build_object('reason',p_reason));
end;
$$;
create function public.resolve_promotion_review(p_id uuid,p_reason text) returns void language sql security invoker set search_path = '' as $$ select private.resolve_promotion_review(p_id,p_reason); $$;
grant execute on function private.manage_campaign(text,boolean),public.manage_campaign(text,boolean),private.promotion_reviews(),public.promotion_reviews(),private.resolve_promotion_review(uuid,text),public.resolve_promotion_review(uuid,text) to authenticated;
grant all on public.campaigns,public.campaign_awards,public.wheel_credits,public.mission_cycles,public.mission_contributions,private.promotion_reviews to service_role;

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    alter publication supabase_realtime add table public.campaigns;
  end if;
end $$;
