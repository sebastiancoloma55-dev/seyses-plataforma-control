-- Idempotent import key: RUT is unique when present; PostgreSQL still permits multiple NULL values.
create unique index if not exists workers_rut_unique_idx
    on public.workers (rut);
