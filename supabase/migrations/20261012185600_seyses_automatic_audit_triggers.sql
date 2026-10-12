-- Automatic audit trail for SEYSES core tables.
create or replace function public.seyses_audit_row_change()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_entity_id text;
  v_changed_columns jsonb := '[]'::jsonb;
begin
  if TG_OP = 'UPDATE' then
    select coalesce(jsonb_agg(key order by key), '[]'::jsonb) into v_changed_columns
    from jsonb_each(to_jsonb(NEW)) n
    where n.key not in ('updated_at')
      and (to_jsonb(OLD) -> n.key) is distinct from (to_jsonb(NEW) -> n.key);
    v_entity_id := coalesce(to_jsonb(NEW) ->> 'id', to_jsonb(NEW) ->> 'user_id');
  elsif TG_OP = 'DELETE' then
    v_entity_id := coalesce(to_jsonb(OLD) ->> 'id', to_jsonb(OLD) ->> 'user_id');
  else
    v_entity_id := coalesce(to_jsonb(NEW) ->> 'id', to_jsonb(NEW) ->> 'user_id');
  end if;
  insert into public.audit_logs(user_id, action, module, entity_type, entity_id, outcome, details)
  values (v_user_id, lower(TG_OP), TG_TABLE_NAME, TG_TABLE_NAME, v_entity_id, 'success',
    jsonb_build_object('source', 'database_trigger', 'changed_columns', v_changed_columns));
  if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
end;
$function$;

create or replace function public.seyses_set_updated_at()
returns trigger language plpgsql set search_path = ''
as $function$
begin
  NEW.updated_at = now();
  return NEW;
end;
$function$;

create trigger audit_user_profiles_changes after insert or update or delete on public.user_profiles
for each row execute function public.seyses_audit_row_change();
create trigger audit_process_runs_changes after insert or update or delete on public.process_runs
for each row execute function public.seyses_audit_row_change();
create trigger audit_processed_files_changes after insert or update or delete on public.processed_files
for each row execute function public.seyses_audit_row_change();
create trigger audit_workers_changes after insert or update or delete on public.workers
for each row execute function public.seyses_audit_row_change();
create trigger audit_discrepancies_changes after insert or update or delete on public.discrepancies
for each row execute function public.seyses_audit_row_change();
create trigger set_user_profiles_updated_at before update on public.user_profiles
for each row execute function public.seyses_set_updated_at();
create trigger set_workers_updated_at before update on public.workers
for each row execute function public.seyses_set_updated_at();
create trigger set_discrepancies_updated_at before update on public.discrepancies
for each row execute function public.seyses_set_updated_at();
