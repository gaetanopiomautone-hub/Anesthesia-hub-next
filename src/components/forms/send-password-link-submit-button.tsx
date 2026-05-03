"use client";

import { useFormStatus } from "react-dom";

export function SendPasswordLinkSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-primary/40 bg-primary/5 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10 disabled:pointer-events-none disabled:opacity-50"
      title="Se l’account non è mai stato confermato reinvia l’invito; altrimenti invia email di reset password. Stesso traguardo: /set-password."
    >
      {pending ? "Invio in corso…" : "Invia link password"}
    </button>
  );
}
