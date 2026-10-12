import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SEYSES | Centro de Control Integral",
  description: "Plataforma de control, conciliación y trazabilidad SEYSES."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
