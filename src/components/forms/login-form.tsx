import { loginAction } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type LoginFormProps = {
  error?: string;
};

export function LoginForm({ error }: LoginFormProps) {
  return (
    <form action={loginAction} className="space-y-5">
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">Email istituzionale</label>
        <Input
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="nome.cognome@policlinicosandonato.it"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">Password</label>
        <Input name="password" type="password" autoComplete="current-password" required placeholder="Password" />
      </div>

      <Button type="submit" className="w-full">
        Accedi
      </Button>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <p className="text-xs text-muted-foreground">
        Accedi con le credenziali assegnate dall&apos;amministrazione del portale. Ruoli e permessi dipendono dal tuo profilo.
      </p>
    </form>
  );
}
