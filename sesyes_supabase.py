"""SEYSES Supabase authentication and audit helpers.

Configure SUPABASE_URL and SUPABASE_KEY (publishable/anon key) as environment
variables or Streamlit secrets. Never use a service-role key in the client app.
"""
import os
import streamlit as st
from supabase import create_client


def _setting(name: str) -> str:
    value = os.getenv(name)
    if value:
        return value
    try:
        return str(st.secrets[name])
    except Exception:
        return ""


def get_client():
    url = _setting("SUPABASE_URL")
    key = _setting("SUPABASE_KEY") or _setting("SUPABASE_PUBLISHABLE_KEY")
    if not url or not key:
        raise RuntimeError(
            "Falta configurar SUPABASE_URL y SUPABASE_KEY en los secretos del entorno."
        )
    return create_client(url, key)


def sign_in(email: str, password: str):
    client = get_client()
    try:
        response = client.auth.sign_in_with_password(
            {"email": email, "password": password}
        )
        auth_user = response.user
        if not auth_user:
            raise RuntimeError("Supabase no devolvió un usuario autenticado.")
        result = (
            client.table("user_profiles")
            .select("user_id, display_name, role, active")
            .eq("user_id", str(auth_user.id))
            .limit(1)
            .execute()
        )
        if not result.data:
            client.auth.sign_out()
            raise RuntimeError(
                "La cuenta existe, pero no tiene perfil SEYSES. Solicita al administrador que cree user_profiles."
            )
        profile = result.data[0]
        if not profile.get("active", False):
            client.auth.sign_out()
            raise RuntimeError("La cuenta SEYSES está desactivada.")
        profile["email"] = auth_user.email or email
        profile["user_id"] = str(auth_user.id)
        log_event(client, profile, "login", "Autenticación", "success")
        return client, profile
    except Exception as exc:
        message = str(exc)
        if "perfil SEYSES" in message or "desactivada" in message:
            raise
        raise RuntimeError(
            "No se pudo iniciar sesión. Revisa el correo, la contraseña y la configuración de Supabase."
        ) from exc


def sign_out(client):
    if client:
        client.auth.sign_out()


def log_event(client, profile: dict, action: str, module: str,
              outcome: str = "success", details: dict | None = None):
    if not client or not profile:
        return
    try:
        client.table("audit_logs").insert({
            "user_id": profile.get("user_id"),
            "actor_email": profile.get("email"),
            "action": action,
            "module": module,
            "outcome": outcome,
            "details": details or {},
        }).execute()
    except Exception:
        # Audit failures must not expose internal database details in the UI.
        pass


def get_audit_logs(client, limit: int = 100):
    result = (
        client.table("audit_logs")
        .select("occurred_at, actor_email, action, module, outcome, details")
        .order("occurred_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data or []
