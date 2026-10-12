-- Prevent concurrent/repeated reconciliation of the same pair of source files.
create unique index if not exists process_runs_reconciliation_pair_unique_idx
on public.process_runs ((metadata ->> 'payroll_sha256'), (metadata ->> 'access_sha256'))
where process_type = 'conciliacion_nomina_accesos'
  and metadata ? 'payroll_sha256'
  and metadata ? 'access_sha256';
