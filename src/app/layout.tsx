import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Anesthesia Hub",
  description: "Gestionale per specializzandi di anestesia del Policlinico San Donato",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
