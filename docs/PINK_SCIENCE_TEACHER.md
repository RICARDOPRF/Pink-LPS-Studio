# Pink Science Teacher integration

`runtime/pink-science-teacher.js` retrieves only authenticated science memory from the server-side context endpoint and converts completed jobs/evidence into a provenance-aware context block for Pink Brain.

The endpoint is JWT protected. Service-role credentials remain server-side.

Scheduler prerequisites `pg_cron` and `pg_net` are enabled. Automatic cron invocation is intentionally not claimed until a scheduled job is actually present and observed in `cron.job_run_details`.
