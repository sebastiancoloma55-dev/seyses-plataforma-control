create or replace function public.seyses_save_reconciliation(
  p_source_filename text,
  p_records_read integer,
  p_metadata jsonb,
  p_workers jsonb,
  p_differences jsonb,
  p_files jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_process_id uuid;
  v_worker_id uuid;
  v_item jsonb;
  v_count_workers integer := 0;
  v_count_differences integer := 0;
begin
  if coalesce(public.seyses_current_role(), '') not in ('admin', 'operator') then
    raise exception 'SEYSES role not allowed to reconcile data' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_workers, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_differences, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_files, '[]'::jsonb)) <> 'array' then
    raise exception 'Invalid reconciliation payload' using errcode = '22023';
  end if;

  insert into public.process_runs(created_by, process_type, status, source_filename, records_read, metadata)
  values (auth.uid(), 'conciliacion_nomina_accesos', 'started', p_source_filename,
          greatest(coalesce(p_records_read, 0), 0), coalesce(p_metadata, '{}'::jsonb))
  returning id into v_process_id;

  for v_item in select value from jsonb_array_elements(coalesce(p_workers, '[]'::jsonb))
  loop
    if nullif(v_item ->> 'rut', '') is null then
      raise exception 'Worker RUT is required' using errcode = '22023';
    end if;
    select id into v_worker_id from public.workers where rut = v_item ->> 'rut' limit 1;
    if found then
      update public.workers set
        full_name = coalesce(nullif(v_item ->> 'full_name', ''), 'Nombre no informado'),
        branch = nullif(v_item ->> 'branch', ''),
        afp = nullif(v_item ->> 'afp', ''),
        health_provider = nullif(v_item ->> 'health_provider', ''),
        payroll_status = nullif(v_item ->> 'payroll_status', ''),
        access_status = nullif(v_item ->> 'access_status', ''),
        seyses_status = nullif(v_item ->> 'seyses_status', ''),
        source_process_id = v_process_id,
        metadata = coalesce(v_item -> 'metadata', '{}'::jsonb)
      where id = v_worker_id;
    else
      insert into public.workers(
        rut, full_name, branch, afp, health_provider, payroll_status, access_status,
        seyses_status, source_process_id, metadata
      ) values (
        v_item ->> 'rut', coalesce(nullif(v_item ->> 'full_name', ''), 'Nombre no informado'),
        nullif(v_item ->> 'branch', ''), nullif(v_item ->> 'afp', ''),
        nullif(v_item ->> 'health_provider', ''), nullif(v_item ->> 'payroll_status', ''),
        nullif(v_item ->> 'access_status', ''), nullif(v_item ->> 'seyses_status', ''),
        v_process_id, coalesce(v_item -> 'metadata', '{}'::jsonb)
      ) returning id into v_worker_id;
    end if;
    v_count_workers := v_count_workers + 1;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_differences, '[]'::jsonb))
  loop
    select id into v_worker_id from public.workers where rut = v_item ->> 'rut' limit 1;
    insert into public.discrepancies(process_run_id, worker_id, rut, full_name, category, severity, description, status)
    values (
      v_process_id, v_worker_id, v_item ->> 'rut', nullif(v_item ->> 'full_name', ''),
      v_item ->> 'category', coalesce(nullif(v_item ->> 'severity', ''), 'warning'),
      v_item ->> 'description', coalesce(nullif(v_item ->> 'status', ''), 'open')
    );
    v_count_differences := v_count_differences + 1;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_files, '[]'::jsonb))
  loop
    insert into public.processed_files(
      uploaded_by, process_run_id, original_filename, file_kind, content_type,
      file_size_bytes, checksum_sha256, status, metadata
    ) values (
      auth.uid(), v_process_id, v_item ->> 'original_filename', v_item ->> 'file_kind',
      nullif(v_item ->> 'content_type', ''), nullif(v_item ->> 'file_size_bytes', '')::bigint,
      nullif(v_item ->> 'checksum_sha256', ''), 'processed', coalesce(v_item -> 'metadata', '{}'::jsonb)
    );
  end loop;

  update public.process_runs set status = 'completed', finished_at = now(),
    records_processed = v_count_workers, differences_found = v_count_differences
  where id = v_process_id;

  return jsonb_build_object('process_id', v_process_id, 'records_processed', v_count_workers,
                            'differences_found', v_count_differences);
end;
$function$;

revoke all on function public.seyses_save_reconciliation(text, integer, jsonb, jsonb, jsonb, jsonb) from public;
revoke all on function public.seyses_save_reconciliation(text, integer, jsonb, jsonb, jsonb, jsonb) from anon;
grant execute on function public.seyses_save_reconciliation(text, integer, jsonb, jsonb, jsonb, jsonb) to authenticated;
