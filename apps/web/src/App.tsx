import { useQueryClient } from "@tanstack/react-query";
import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { Brand, Layout } from "./components/Layout";
import { Button, Card, Field, Input, Spinner } from "./components/ui";
import { FormsProvider } from "./features/forms";
import { api, ApiError } from "./lib/api";
import { useLocale, useT } from "./lib/i18n";
import { OrgProvider, useMe } from "./lib/org";
import { errorText } from "./lib/queries";
import { AssetPage } from "./pages/AssetPage";
import { AssetsPage } from "./pages/AssetsPage";
import { InvitePage, LoginPage, RegisterPage } from "./pages/AuthPages";
import { ContactsPage } from "./pages/ContactsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { MorePage } from "./pages/MorePage";
import { NotesPage } from "./pages/NotesPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { logout, SettingsPage } from "./pages/SettingsPage";
import { TeamPage } from "./pages/TeamPage";
import { TicketsPage } from "./pages/TicketsPage";
import { WorkTimePage } from "./pages/WorkTimePage";

function Splash({ error, retry }: { error?: boolean; retry?: () => void }) {
  const t = useT();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <Brand />
      {error ? (
        <div role="alert" className="grid grid-cols-1 justify-items-center gap-3">
          <WifiOff size={28} className="text-muted" aria-hidden />
          <p className="max-w-xs text-[0.9375rem]">{t("app.loadFailed")}</p>
          <Button variant="primary" onClick={retry}>
            {t("common.retry")}
          </Button>
        </div>
      ) : (
        <Spinner />
      )}
    </div>
  );
}

/** Signed in but not a member of any farm (e.g. removed from the only one). */
function NoFarm() {
  const t = useT();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/orgs", { method: "POST", json: { name } });
      await qc.invalidateQueries({ queryKey: ["me"] });
    } catch (err) {
      setError(err);
    }
    setBusy(false);
  };
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Brand className="mb-7" />
        <Card className="p-5 sm:p-7">
          <h1 className="text-2xl font-extrabold tracking-tight">{t("nofarm.title")}</h1>
          <p className="mt-1.5 text-[0.9375rem] text-muted">{t("nofarm.text")}</p>
          <form
            className="mt-5 grid grid-cols-1 gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <Field label={t("auth.farmName")}>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
            </Field>
            {!!error && (
              <p role="alert" className="rounded-control bg-danger-soft px-3.5 py-2.5 text-sm font-semibold text-danger">
                {errorText(t, error)}
              </p>
            )}
            <Button type="submit" variant="primary" size="lg" busy={busy} disabled={!name.trim()}>
              {t("nofarm.create")}
            </Button>
            <Button variant="ghost" onClick={logout}>
              {t("auth.logout")}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

function Authed() {
  const me = useMe();
  const location = useLocation();
  const { setLocale } = useLocale();
  const userLocale = me.data?.user.locale;
  // The language saved in the profile follows the user across devices.
  useEffect(() => {
    if (userLocale) setLocale(userLocale);
  }, [userLocale, setLocale]);

  if (me.error instanceof ApiError && me.error.status === 401) {
    const next = location.pathname + location.search;
    return <Navigate to={next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`} replace />;
  }
  if (!me.data) return <Splash error={me.isError} retry={() => me.refetch()} />;
  return (
    <OrgProvider me={me.data} empty={<NoFarm />} fallback={(state) => <Splash {...state} />}>
      <FormsProvider>
        <Layout />
      </FormsProvider>
    </OrgProvider>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/invite/:token" element={<InvitePage />} />
      <Route element={<Authed />}>
        <Route index element={<DashboardPage />} />
        <Route path="tickets" element={<TicketsPage />} />
        <Route path="worktime" element={<WorkTimePage />} />
        <Route path="machines" element={<AssetsPage kind="machine" />} />
        <Route path="buildings" element={<AssetsPage kind="building" />} />
        <Route path="assets/:assetId" element={<AssetPage />} />
        <Route path="notes" element={<NotesPage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="team" element={<TeamPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="more" element={<MorePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
