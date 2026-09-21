-- Database-local worker: no browser/service secret and no external HTTP call.
-- Standard PostgreSQL test runtimes without pg_cron exercise the same functions.
create table private.database_health_checks (
  id bigint generated always as identity primary key,
  checked_at timestamptz not null default now(), report jsonb not null
);
alter table private.database_health_checks enable row level security;
revoke all on private.database_health_checks from public,anon,authenticated;
grant all on private.database_health_checks to service_role;
grant usage,select on sequence private.database_health_checks_id_seq to service_role;
create function private.record_database_health() returns void language sql security definer set search_path='' as $$
  insert into private.database_health_checks(report) values(private.database_health());
$$;
do $$ begin
  if exists(select 1 from pg_available_extensions where name='pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('pearl-pos-retry','* * * * *','select private.process_pos_batch()');
    perform cron.schedule('pearl-database-health','*/15 * * * *','select private.record_database_health()');
  end if;
end $$;
