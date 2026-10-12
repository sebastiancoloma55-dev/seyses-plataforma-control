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
      // Never fall back to localhost when the user requests recovery from a Preview or email client.
      // Set NEXT_PUBLIC_SITE_URL to the production domain when production is configured.
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://seyses-plataforma-control-iyr5-git-feat-vercel-ne-ae0858-simi23.vercel.app";
      const redirectTo = new URL("/restablecer", siteUrl).toString();
      const { error: resetError } = await getSupabase().auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (resetError) throw resetError;
      setMessage("Si el correo está registrado, recibirás un enlace para crear una contraseña nueva. Revisa también Spam.");
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : "Error desconocido";
      console.error("SEYSES password recovery failed:", detail);
      setError(`No se pudo solicitar el enlace. Detalle: ${detail}. Si indica redirect URL no permitida, agrega la URL de este sitio en Supabase > Authentication > URL Configuration. Si indica SMTP/email, revisa el proveedor de correo de Auth.`);
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
