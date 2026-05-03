# Backlog

## Login — “Password dimenticata”

- Aggiungere nella pagina `/login` un flusso “Password dimenticata” (link o bottone).
- Chiamata lato server o client con client anon Supabase, ad esempio:

  ```ts
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${SITE_URL}/set-password`,
  });
  ```

  dove `SITE_URL` coincide con `NEXT_PUBLIC_SITE_URL` (senza slash finale), come già usato altrove (`siteUrlForAuthRedirect()` + `/set-password`).

- UX: campo email (o riuso email dal form login), messaggio di conferma invio, gestione errori (rate limit già mappato con `describeSupabaseAuthEmailError` dove applicabile).

**TL;DR — workaround finché non c’è il bottone**

- Supabase Dashboard → **Authentication → Users** → reset password sull’utente, **oppure**
- dall’app: **Admin → lista utenti → Invia link password** (stesso traguardo `/set-password`).
