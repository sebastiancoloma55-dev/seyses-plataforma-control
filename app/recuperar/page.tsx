"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase";

export default function RecuperarCuenta() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage(""); setError("");
    try {
      const origin = window.location.origin;
      const { error: resetError } = await getSupabase().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${origin}/restablecer`
      });
      if (resetError) throw resetError;
      setMessage("Si el correo está registrado, recibirás un enlace para crear una contraseña nueva. Revisa también Spam.");
    } catch {
      setError("No se pudo solicitar el enlace. Verifica la configuración de Auth y las URLs de redirección en Supabase.");
    } finally { setBusy(false); }
  }

  return <main className="login-page"><section className="login-card">
    <div className="brand">SEYSES <span>◈</span><small>CENTRO DE CONTROL INTEGRAL</small></div>
    <h1>Recuperar contraseña</h1>
    <p>Te enviaremos un enlace al correo de tu cuenta SEYSES para que elijas una contraseña nueva.</p>
    <form onSubmit={submit}>
      <div className="field"><label htmlFor="email">Correo electrónico</label><input id="email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu correo registrado" required /></div>
      {error && <div className="notice error" role="alert">{error}</div>}
      {message && <div className="notice success" role="status">{message}</div>}
      <button className="btn primary" type="submit" disabled={busy}>{busy ? "Solicitando enlace…" : "Enviar enlace de recuperación"}</button>
    </form>
    <p style={{textAlign:"center",marginTop:18}}><Link href="/">Volver al inicio de sesión</Link></p>
  </section></main>;
}
