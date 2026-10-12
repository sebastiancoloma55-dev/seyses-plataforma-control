-- Wire attendance imports into the standard SEYSES process/file history and harden role validation.
alter table public.attendance_imports
  add column if not exists process_run_id uuid references public.process_runs(id) on delete set null;

create or replace function public.seyses_save_attendance_report(
  p_import jsonb,
  p_records jsonb,
  p_replace_existing boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_import_id uuid;
  v_process_id uuid;
  v_erp text;
  v_filename text;
  v_start date;
  v_end date;
  v_hash text;
  v_total integer;
  v_valid integer;
  v_rejected integer;
  v_saved integer := 0;
  v_diff integer := 0;
  v_file_size bigint;
  v_email text;
  v_format text;
begin
  if v_user_id is null then
    raise exception 'Debes iniciar sesión para importar reportes.';
  end if;

  select up.role into v_role
  from public.user_profiles up
  where up.user_id = v_user_id and up.active = true;

  if coalesce(v_role,'') not in ('admin','operator') then
    raise exception 'Tu perfil no tiene permiso para importar reportes de asistencia.';
  end if;

  if p_import is null or jsonb_typeof(p_import) <> 'object' then
    raise exception 'Los metadatos del reporte no son válidos.';
  end if;
  if p_records is null or jsonb_typeof(p_records) <> 'array' then
    raise exception 'Las filas normalizadas no son válidas.';
  end if;
  if jsonb_array_length(p_records) < 1 or jsonb_array_length(p_records) > 10000 then
    raise exception 'El reporte debe tener entre 1 y 10000 filas válidas.';
  end if;

  v_erp := coalesce(nullif(btrim(p_import->>'erp_name'), ''), 'ERP genérico');
  v_filename := coalesce(nullif(btrim(p_import->>'original_filename'), ''), 'reporte_asistencia');
  v_start := nullif(p_import->>'period_start','')::date;
  v_end := nullif(p_import->>'period_end','')::date;
  v_hash := lower(coalesce(p_import->>'file_sha256',''));
  v_total := greatest(coalesce(nullif(p_import->>'rows_total','')::integer, jsonb_array_length(p_records)), jsonb_array_length(p_records));
  v_valid := jsonb_array_length(p_records);
  v_rejected := greatest(coalesce(nullif(p_import->>'rows_rejected','')::integer,0),0);
  v_file_size := greatest(coalesce(nullif(p_import->>'file_size_bytes','')::bigint,0),0);
  v_format := lower(coalesce(nullif(p_import->>'format',''), split_part(v_filename,'.',greatest(array_length(string_to_array(v_filename,'.'),1),1)), ''));
  v_email := (select u.email from auth.users u where u.id = v_user_id);

  if v_start is null or v_end is null or v_end < v_start then
    raise exception 'El período del reporte no es válido.';
  end if;
  if v_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'La huella SHA-256 del archivo no es válida.';
  end if;

  select ai.id into v_import_id
  from public.attendance_imports ai
  where ai.created_by = v_user_id and ai.file_sha256 = v_hash;

  if v_import_id is not null then
    select count(*)::integer into v_saved from public.attendance_records ar where ar.import_id = v_import_id;
    return jsonb_build_object('id',v_import_id,'duplicate',true,'records_saved',v_saved);
  end if;

  if coalesce(p_replace_existing,false) then
    delete from public.attendance_imports ai
    where ai.created_by = v_user_id and lower(ai.erp_name) = lower(v_erp)
      and ai.period_start = v_start and ai.period_end = v_end;
  end if;

  insert into public.process_runs (
    created_by, process_type, status, source_filename, records_read, records_processed,
    differences_found, metadata
  ) values (
    v_user_id, 'attendance_universal_import', 'started', v_filename, v_total, 0, 0,
    jsonb_build_object('erp_name',v_erp,'period_start',v_start,'period_end',v_end)
  ) returning id into v_process_id;

  insert into public.attendance_imports (
    created_by, original_filename, erp_name, period_start, period_end,
    file_sha256, rows_total, rows_valid, rows_rejected, status, metadata, process_run_id
  ) values (
    v_user_id, v_filename, v_erp, v_start, v_end, v_hash, v_total, v_valid, v_rejected,
    case when v_rejected > 0 then 'completed_with_warnings' else 'completed' end,
    coalesce(p_import->'metadata','{}'::jsonb), v_process_id
  ) returning id into v_import_id;

  insert into public.processed_files (
    uploaded_by, process_run_id, original_filename, file_kind, content_type, file_size_bytes,
    checksum_sha256, status, metadata
  ) values (
    v_user_id, v_process_id, v_filename, 'attendance_report',
    case when v_format = 'csv' then 'text/csv'
      when v_format = 'xls' then 'application/vnd.ms-excel'
      else 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' end,
    v_file_size, v_hash, 'processed',
    jsonb_build_object('erp_name',v_erp,'period_start',v_start,'period_end',v_end,
      'raw_file_saved',false,'note','Se conserva la huella y la trazabilidad; el archivo original no se almacena en Storage.')
  );

  insert into public.attendance_records (
    import_id, source_row, worker_key, worker_rut, worker_name, branch, work_date,
    shift_name, scheduled_start, scheduled_end, actual_start, actual_end,
    scheduled_minutes, worked_minutes, overtime_minutes, late_minutes, attendance_status
  )
  select
    v_import_id,
    nullif(x.source_row,'')::integer,
    coalesce(nullif(btrim(x.worker_key),''), nullif(btrim(x.worker_rut),''), nullif(btrim(x.worker_name),'')),
    nullif(btrim(x.worker_rut),''),
    nullif(btrim(x.worker_name),''),
    nullif(btrim(x.branch),''),
    nullif(x.work_date,'')::date,
    nullif(btrim(x.shift_name),''),
    nullif(x.scheduled_start,'')::time,
    nullif(x.scheduled_end,'')::time,
    nullif(x.actual_start,'')::time,
    nullif(x.actual_end,'')::time,
    greatest(coalesce(nullif(x.scheduled_minutes,'')::integer,0),0),
    greatest(coalesce(nullif(x.worked_minutes,'')::integer,0),0),
    greatest(coalesce(nullif(x.overtime_minutes,'')::integer,0),0),
    greatest(coalesce(nullif(x.late_minutes,'')::integer,0),0),
    nullif(btrim(x.attendance_status),'')
  from jsonb_to_recordset(p_records) as x(
    source_row text, worker_key text, worker_rut text, worker_name text, branch text,
    work_date text, shift_name text, scheduled_start text, scheduled_end text,
    actual_start text, actual_end text, scheduled_minutes text, worked_minutes text,
    overtime_minutes text, late_minutes text, attendance_status text
  );

  get diagnostics v_saved = row_count;
  if v_saved <> v_valid then
    raise exception 'No se guardaron todas las filas normalizadas.';
  end if;

  select count(*)::integer into v_diff
  from public.attendance_records ar
  where ar.import_id = v_import_id
    and (ar.late_minutes > 0 or ar.overtime_minutes > 0 or (ar.scheduled_minutes > 0 and ar.worked_minutes = 0));

  update public.process_runs
  set status = 'completed', finished_at = now(), records_processed = v_saved,
      differences_found = v_diff,
      metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object('attendance_import_id',v_import_id,'rows_rejected',v_rejected)
  where id = v_process_id;

  insert into public.audit_logs(user_id, actor_email, action, module, entity_type, entity_id, outcome, details)
  values (
    v_user_id, v_email, 'attendance_report_imported', 'Analizador universal de asistencia',
    'attendance_import', v_import_id::text, 'success',
    jsonb_build_object('erp_name',v_erp,'period_start',v_start,'period_end',v_end,
      'rows_total',v_total,'rows_saved',v_saved,'rows_rejected',v_rejected,'filename',v_filename)
  );

  return jsonb_build_object('id',v_import_id,'duplicate',false,'records_saved',v_saved,'process_run_id',v_process_id);
end;
$function$;

revoke all on function public.seyses_save_attendance_report(jsonb,jsonb,boolean) from public, anon;
grant execute on function public.seyses_save_attendance_report(jsonb,jsonb,boolean) to authenticated;
