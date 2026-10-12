-- Restrict direct invocation of security-sensitive helper functions.
revoke all on function public.seyses_audit_row_change() from public;
revoke all on function public.seyses_audit_row_change() from anon;
revoke all on function public.seyses_audit_row_change() from authenticated;
grant execute on function public.seyses_audit_row_change() to service_role;

revoke all on function public.seyses_current_role() from public;
revoke all on function public.seyses_current_role() from anon;
grant execute on function public.seyses_current_role() to authenticated;
grant execute on function public.seyses_current_role() to service_role;
