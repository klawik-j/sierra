import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router";
import type { InvitationInfoDto } from "@sierra/shared";
import { Brand } from "../components/Layout";
import { Button, Card, Field, Input, Spinner } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { useLocale, useT } from "../lib/i18n";
import { useMe } from "../lib/org";
import { errorText } from "../lib/queries";
import { logout } from "./SettingsPage";

const safeNext = (value: string | null) => (value && value.startsWith("/") && !value.startsWith("//") ? value : "/");

function AuthShell({ title, text, children, footer }: { title: string; text?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const { locale, setLocale } = useLocale();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-7 flex items-center justify-between">
          <Brand />
          <button type="button" onClick={() => setLocale(locale === "pl" ? "en" : "pl")} className="min-h-tap rounded-control px-2 text-sm font-bold text-muted hover:text-fg" aria-label="Language / Język">
            {locale === "pl" ? "English" : "Polski"}
          </button>
        </div>
        <Card className="p-5 sm:p-7">
          <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
          {text && <p className="mt-1.5 text-[0.9375rem] text-muted">{text}</p>}
          <div className="mt-5">{children}</div>
        </Card>
        {footer && <p className="mt-5 text-center text-[0.9375rem] text-muted">{footer}</p>}
      </div>
    </div>
  );
}

function ErrorNote({ error }: { error: unknown }) {
  const t = useT();
  if (!error) return null;
  return (
    <p role="alert" className="rounded-control bg-danger-soft px-3.5 py-2.5 text-sm font-semibold text-danger">
      {errorText(t, error)}
    </p>
  );
}

const useAuthConfig = () => useQuery({ queryKey: ["auth-config"], queryFn: () => api<{ allowSignup: boolean }>("/api/auth/config"), staleTime: Infinity });

/** Runs an auth request, then reloads the session and navigates. */
function useAuthAction(next: string) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      qc.clear();
      navigate(next, { replace: true });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };
  return { run, busy, error };
}

export function LoginPage() {
  const t = useT();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const config = useAuthConfig();
  const me = useMe();
  const { run, busy, error } = useAuthAction(next);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  if (me.data && !busy) return <Navigate to={next} replace />;
  return (
    <AuthShell
      title={t("auth.loginTitle")}
      text={t("auth.loginText")}
      footer={
        config.data?.allowSignup && (
          <>
            {t("auth.noAccount")}{" "}
            <Link to="/register" className="font-bold text-primary-ink underline underline-offset-2">
              {t("auth.registerLink")}
            </Link>
          </>
        )
      }
    >
      <form
        className="grid grid-cols-1 gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => api("/api/auth/login", { method: "POST", json: { email, password } }));
        }}
      >
        <Field label={t("auth.email")}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" inputMode="email" required autoFocus />
        </Field>
        <Field label={t("auth.password")}>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </Field>
        <ErrorNote error={error} />
        <Button type="submit" variant="primary" size="lg" busy={busy}>
          {t("auth.login")}
        </Button>
      </form>
    </AuthShell>
  );
}

export function RegisterPage() {
  const t = useT();
  const { locale } = useLocale();
  const { run, busy, error } = useAuthAction("/");
  const [f, setF] = useState({ name: "", orgName: "", email: "", password: "" });
  const bind = (key: keyof typeof f) => ({ value: f[key], onChange: (e: { target: { value: string } }) => setF((p) => ({ ...p, [key]: e.target.value })) });
  return (
    <AuthShell
      title={t("auth.registerTitle")}
      text={t("auth.registerText")}
      footer={
        <>
          {t("auth.haveAccount")}{" "}
          <Link to="/login" className="font-bold text-primary-ink underline underline-offset-2">
            {t("auth.login")}
          </Link>
        </>
      }
    >
      <form
        className="grid grid-cols-1 gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => api("/api/auth/register", { method: "POST", json: { ...f, locale } }));
        }}
      >
        <Field label={t("auth.name")}>
          <Input {...bind("name")} autoComplete="name" maxLength={120} required autoFocus />
        </Field>
        <Field label={t("auth.farmName")} hint={t("auth.farmNameHint")}>
          <Input {...bind("orgName")} autoComplete="organization" maxLength={120} required />
        </Field>
        <Field label={t("auth.email")}>
          <Input type="email" {...bind("email")} autoComplete="username" inputMode="email" required />
        </Field>
        <Field label={t("auth.password")} hint={t("auth.passwordHint")}>
          <Input type="password" {...bind("password")} autoComplete="new-password" minLength={8} required />
        </Field>
        <ErrorNote error={error} />
        <Button type="submit" variant="primary" size="lg" busy={busy}>
          {t("auth.register")}
        </Button>
      </form>
    </AuthShell>
  );
}

export function InvitePage() {
  const t = useT();
  const { token = "" } = useParams();
  const me = useMe();
  const info = useQuery({ queryKey: ["invite", token], queryFn: () => api<InvitationInfoDto>(`/api/invitations/${token}`), retry: false });
  const { run, busy, error } = useAuthAction("/");
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const accept = (body: object) =>
    run(async () => {
      const { orgId } = await api<{ orgId: string }>(`/api/invitations/${token}/accept`, { method: "POST", json: body });
      localStorage.setItem("sierra.org", orgId);
    });

  if (info.isPending || me.isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (info.isError) {
    return (
      <AuthShell
        title={t("invite.invalidTitle")}
        text={info.error instanceof ApiError && info.error.code === "invite_invalid" ? t("err.invite_invalid") : errorText(t, info.error)}
        footer={
          <Link to="/login" className="font-bold text-primary-ink underline underline-offset-2">
            {t("auth.login")}
          </Link>
        }
      >
        {null}
      </AuthShell>
    );
  }
  const { orgName, role, invitedBy } = info.data;
  const intro = (
    <>
      {invitedBy ? t("invite.textBy", { who: invitedBy, org: orgName }) : t("invite.text", { org: orgName })} {t("invite.role", { role: t(`role.${role}`) })}
    </>
  );

  if (me.data) {
    return (
      <AuthShell title={t("invite.title", { org: orgName })} text={intro}>
        <div className="grid grid-cols-1 gap-4">
          <p className="text-[0.9375rem]">{t("invite.signedInAs", { name: me.data.user.name, email: me.data.user.email })}</p>
          <ErrorNote error={error} />
          <Button variant="primary" size="lg" busy={busy} onClick={() => accept({})}>
            {t("invite.join")}
          </Button>
          <Button variant="ghost" onClick={logout}>
            {t("invite.otherAccount")}
          </Button>
        </div>
      </AuthShell>
    );
  }
  return (
    <AuthShell
      title={t("invite.title", { org: orgName })}
      text={intro}
      footer={
        <>
          {t("auth.haveAccount")}{" "}
          <Link to={`/login?next=${encodeURIComponent(`/invite/${token}`)}`} className="font-bold text-primary-ink underline underline-offset-2">
            {t("auth.login")}
          </Link>
        </>
      }
    >
      <form
        className="grid grid-cols-1 gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void accept(f);
        }}
      >
        <Field label={t("auth.name")}>
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" maxLength={120} required autoFocus />
        </Field>
        <Field label={t("auth.email")}>
          <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="username" inputMode="email" required />
        </Field>
        <Field label={t("auth.password")} hint={t("auth.passwordHint")}>
          <Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" minLength={8} required />
        </Field>
        <ErrorNote error={error} />
        <Button type="submit" variant="primary" size="lg" busy={busy}>
          {t("invite.join")}
        </Button>
      </form>
    </AuthShell>
  );
}
