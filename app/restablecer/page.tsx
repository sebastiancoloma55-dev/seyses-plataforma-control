"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase";

export default function RestablecerCuenta() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [valid, setValid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data }) => {
      if (active) setValid(Boolean(data.session));
    }).catch(() => { if (active) setValid(false); });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (active && (event === "PASSWORD_RECOVERY" || session)) setValid(true);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(""); setError("");
    if (password.length < 10) { setError("Usa al menos 10 caracteres."); setBusy(false); return; }
    if (password !== confirm) { setError("Las contraseñas no coinciden."); setBusy(false); return; }
    try {
      const { error: updateError } = await getSupabase().auth.updateUser({ password });
      if (updateError) throw updateError;
      setPassword(""); setConfirm("");
      setMessage("Contraseña actualizada. Ya puedes volver al inicio e ingresar con tu nueva contraseña.");
      await getSupabase().auth.signOut();
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : "Error desconocido";
      console.error("SEYSES password update failed:", detail);
      setError(`No se pudo cambiar la contraseña: ${detail}. Si el enlace venció o ya se usó, solicita uno nuevo.`);
    } finally { setBusy(false); }
  }

  return <main className="login-page"><section className="login-card">
    <div className="brand">SEYSES <span>◈</span><small>CENTRO DE CONTROL INTEGRAL</small></div>
    <h1>Nueva contraseña</h1>
    {!valid ? <><p>Abre esta página desde el enlace que enviamos a tu correo. Si el enlace venció, solicita otro.</p><Link href="/recuperar">Solicitar nuevo enlace</Link></> : <>
      <p>Elige una contraseña nueva de al menos 10 caracteres.</p>
      <form onSubmit={submit}>
        <div className="field"><label htmlFor="password">Nueva contraseña</label><input id="password" type="password" autoComplete="new-password" minLength={10} value={password} onChange={e => setPassword(e.target.value)} required /></div>
        <div className="field"><label htmlFor="confirm">Confirmar contraseña</label><input id="confirm" type="password" autoComplete="new-password" minLength={10} value={confirm} onChange={e => setConfirm(e.target.value)} required /></div>
        {error && <div className="notice error" role="alert">{error}</div>}
        {message && <div className="notice success" role="status">{message}</div>}
        <button className="btn primary" type="submit" disabled={busy}>{busy ? "Actualizando…" : "Guardar nueva contraseña"}</button>
      </form>
    </>}
    <p style={{textAlign:"center",marginTop:18}}><Link href="/">Volver al inicio de sesión</Link></p>
  </section></main>;
}
