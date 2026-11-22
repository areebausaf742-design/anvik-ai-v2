-- ANVIK AI V2: clean up expired distributed rate-limit buckets.
-- Applied to production on 2026-11-22 as migration 20261122160403.
-- Retain a seven-day window for diagnostics; active counters are not affected.
create extension if not exists pg_cron with schema pg_catalog;

do $$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'anvik-rate-limit-bucket-cleanup'
  ) then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'anvik-rate-limit-bucket-cleanup';
  end if;
end
$$;

select cron.schedule(
  'anvik-rate-limit-bucket-cleanup',
  '23 0 * * *',
  $job$
    delete from public.rate_limit_buckets
    where updated_at < now() - interval '7 days';
  $job$
);
