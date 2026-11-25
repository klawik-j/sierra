import { useQueryClient } from "@tanstack/react-query";
import { Check, LogOut, Monitor, Moon, Plus, Sun, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { locales, type CategoryDto, type Locale } from "@sierra/shared";
import { RoleBadge } from "../components/domain";
import { Button, Card, cx, Field, IconButton, Input, PageHeader, Segmented, Select, Toggle, useConfirm } from "../components/ui";
import { api } from "../lib/api";
import { useLocale, useT } from "../lib/i18n";
import { useOrg } from "../lib/org";
import { errorText, useAct, useOrgApi } from "../lib/queries";
import { useTheme, type ThemePref } from "../lib/theme";
import { useToast } from "../lib/toast";

function Panel({ title, text, children }: { title: string; text?: string; children: ReactNode }) {
  return (
    <section className="grid grid-cols-1 gap-3 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8">
      <div>
        <h2 className="text-base font-bold">{title}</h2>
        {text && <p className="mt-1 text-sm text-muted">{text}</p>}
      </div>
      <Card className="p-4 sm:p-5">{children}</Card>
    </section>
  );
}

export async function logout() {
  await api("/api/auth/logout", { method: "POST", json: {} }).catch(() => undefined);
  window.location.assign("/login");
}

export function SettingsPage() {
  const t = useT();
  const { can } = useOrg();
  return (
    <>
      <PageHeader title={t("nav.settings")} />
      <div className="grid max-w-4xl grid-cols-1 gap-8">
        <Profile />
        <Appearance />
        <Password />
        {can("org.manage") && <Farm />}
        {can("categories.manage") && <Categories />}
        <Farms />
        <div className="flex justify-start border-t border-line pt-6">
          <Button variant="danger" icon={<LogOut size={18} aria-hidden />} onClick={logout}>
            {t("auth.logout")}
          </Button>
        </div>
      </div>
    </>
  );
}

function Profile() {
  const t = useT();
  const { user } = useOrg();
  const { setLocale } = useLocale();
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({ name: user.name, phone: user.phone ?? "", locale: user.locale });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api("/api/me", { method: "PATCH", json: f });
      setLocale(f.locale);
      await qc.invalidateQueries();
      toast.push(t("common.saved"));
    } catch (err) {
      toast.push(errorText(t, err), "error");
    }
    setBusy(false);
  };
  return (
    <Panel title={t("settings.profile")} text={user.email}>
      <form
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label={t("auth.name")}>
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} required autoComplete="name" />
        </Field>
        <Field label={t("contacts.phone")} hint={t("settings.phoneHint")}>
          <Input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={40} autoComplete="tel" inputMode="tel" />
        </Field>
        <Field label={t("settings.language")}>
          <Select value={f.locale} onChange={(e) => setF({ ...f, locale: e.target.value as Locale })}>
            {locales.map((l) => (
              <option key={l} value={l}>
                {l === "pl" ? "Polski" : "English"}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end justify-end">
          <Button type="submit" variant="primary" busy={busy} disabled={!f.name.trim()}>
            {t("common.save")}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function Appearance() {
  const t = useT();
  const [theme, setTheme] = useTheme();
  return (
    <Panel title={t("settings.appearance")} text={t("settings.appearanceText")}>
      <Segmented<ThemePref>
        label={t("settings.theme")}
        value={theme}
        onChange={setTheme}
        options={[
          { value: "system", label: <><Monitor size={16} aria-hidden />{t("settings.theme.system")}</> },
          { value: "light", label: <><Sun size={16} aria-hidden />{t("settings.theme.light")}</> },
          { value: "dark", label: <><Moon size={16} aria-hidden />{t("settings.theme.dark")}</> },
        ]}
        className="flex w-full sm:w-auto"
      />
    </Panel>
  );
}

function Password() {
  const t = useT();
  const toast = useToast();
  const [f, setF] = useState({ current: "", next: "" });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api("/api/me/password", { method: "POST", json: f });
      setF({ current: "", next: "" });
      toast.push(t("settings.passwordChanged"));
    } catch (err) {
      toast.push(errorText(t, err), "error");
    }
    setBusy(false);
  };
  return (
    <Panel title={t("settings.password")} text={t("settings.passwordText")}>
      <form
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label={t("settings.currentPassword")}>
          <Input type="password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} autoComplete="current-password" required />
        </Field>
        <Field label={t("settings.newPassword")} hint={t("auth.passwordHint")}>
          <Input type="password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} autoComplete="new-password" minLength={8} required />
        </Field>
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" busy={busy} disabled={!f.current || f.next.length < 8}>
            {t("settings.changePassword")}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function Farm() {
  const t = useT();
  const { org, orgId } = useOrg();
  const act = useAct();
  const qc = useQueryClient();
  const [f, setF] = useState({ name: org.name, ticketPrefix: org.ticketPrefix, address: org.address ?? "", phone: org.phone ?? "", settings: org.settings });
  const [busy, setBusy] = useState(false);
  const prefixOk = /^[A-Za-z]{2,5}$/.test(f.ticketPrefix.trim());
  const save = async () => {
    setBusy(true);
    await act(async () => {
      await api(`/api/o/${orgId}`, { method: "PATCH", json: f });
      await qc.invalidateQueries({ queryKey: ["me"] });
    }, t("common.saved"));
    setBusy(false);
  };
  return (
    <Panel title={t("settings.farm")} text={t("settings.farmText")}>
      <form
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label={t("settings.farmName")}>
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} required />
        </Field>
        <Field label={t("settings.ticketPrefix")} hint={t("settings.ticketPrefixHint", { example: `${(f.ticketPrefix || "SRA").toUpperCase()}-12` })}>
          <Input value={f.ticketPrefix} onChange={(e) => setF({ ...f, ticketPrefix: e.target.value.toUpperCase() })} maxLength={5} required autoCapitalize="characters" />
        </Field>
        <Field label={t("contacts.address")}>
          <Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} maxLength={300} />
        </Field>
        <Field label={t("contacts.phone")}>
          <Input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={40} inputMode="tel" />
        </Field>
        <div className="grid grid-cols-1 gap-1 border-t border-line pt-3 sm:col-span-2">
          <p className="text-sm font-bold">{t("settings.employeeRights")}</p>
          <Toggle label={t("settings.employeesSeeAll")} hint={t("settings.employeesSeeAllHint")} checked={f.settings.employeesSeeAllTickets} onChange={(v) => setF({ ...f, settings: { ...f.settings, employeesSeeAllTickets: v } })} />
          <Toggle label={t("settings.employeesCreate")} hint={t("settings.employeesCreateHint")} checked={f.settings.employeesCreateTickets} onChange={(v) => setF({ ...f, settings: { ...f.settings, employeesCreateTickets: v } })} />
        </div>
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" variant="primary" busy={busy} disabled={!f.name.trim() || !prefixOk}>
            {t("common.save")}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

const PALETTE = ["#c2410c", "#b45309", "#4d7c0f", "#0f766e", "#1d4ed8", "#7e22ce", "#be185d", "#57534e"];

function Categories() {
  const t = useT();
  const { categories } = useOrg();
  const orgApi = useOrgApi();
  const act = useAct();
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[0]!);
  const add = async () => {
    if (!name.trim()) return;
    if (await act(() => orgApi.post("/categories", { name, color }))) {
      setName("");
      setColor(PALETTE[(categories.length + 1) % PALETTE.length]!);
    }
  };
  return (
    <Panel title={t("settings.categories")} text={t("settings.categoriesText")}>
      <ul className="grid grid-cols-1 gap-2">
        {categories.map((c) => (
          <CategoryRow key={c.id} category={c} />
        ))}
      </ul>
      <form
        className="mt-3 flex items-center gap-2 border-t border-line pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <ColorInput value={color} onChange={setColor} />
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("settings.newCategory")} maxLength={60} aria-label={t("settings.newCategory")} />
        <Button type="submit" icon={<Plus size={18} aria-hidden />} disabled={!name.trim()}>
          <span className="hidden sm:inline">{t("common.add")}</span>
        </Button>
      </form>
    </Panel>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useT();
  return (
    <label className="relative flex size-tap shrink-0 items-center justify-center rounded-control border border-line bg-surface" title={t("settings.color")}>
      <span className="size-5 rounded-full" style={{ background: value }} aria-hidden />
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={t("settings.color")} />
    </label>
  );
}

function CategoryRow({ category }: { category: CategoryDto }) {
  const t = useT();
  const orgApi = useOrgApi();
  const act = useAct();
  const confirm = useConfirm();
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color);
  const dirty = name.trim() !== category.name || color !== category.color;
  const save = () => act(() => orgApi.patch(`/categories/${category.id}`, { name, color }));
  const remove = async () => {
    if (await confirm({ title: t("settings.deleteCategoryTitle"), message: t("settings.deleteCategoryText", { name: category.name }), confirmLabel: t("common.delete"), danger: true })) await act(() => orgApi.del(`/categories/${category.id}`));
  };
  return (
    <li className="flex items-center gap-2">
      <ColorInput value={color} onChange={setColor} />
      <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label={t("ticket.category")} />
      {dirty ? (
        <IconButton label={t("common.save")} className="bg-primary text-on-primary hover:bg-primary-hover hover:text-on-primary" onClick={save} disabled={!name.trim()}>
          <Check size={19} strokeWidth={3} aria-hidden />
        </IconButton>
      ) : (
        <IconButton label={`${t("common.delete")}: ${category.name}`} onClick={remove}>
          <Trash2 size={18} aria-hidden />
        </IconButton>
      )}
    </li>
  );
}

function Farms() {
  const t = useT();
  const { memberships, orgId, switchOrg } = useOrg();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const { id } = await api<{ id: string }>("/api/orgs", { method: "POST", json: { name } });
      await qc.invalidateQueries({ queryKey: ["me"] });
      setName("");
      switchOrg(id);
      toast.push(t("settings.farmCreated"));
    } catch (err) {
      toast.push(errorText(t, err), "error");
    }
    setBusy(false);
  };
  return (
    <Panel title={t("settings.farms")} text={t("settings.farmsText")}>
      <ul className="grid grid-cols-1 gap-1.5">
        {memberships.map((m) => (
          <li key={m.orgId}>
            <button type="button" onClick={() => switchOrg(m.orgId)} aria-pressed={m.orgId === orgId} className={cx("flex min-h-12 w-full items-center gap-3 rounded-control border px-3 text-left", m.orgId === orgId ? "border-primary bg-primary-soft" : "border-line hover:bg-surface-2")}>
              <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold">{m.orgName}</span>
              <RoleBadge role={m.role} />
              {m.orgId === orgId && <Check size={18} className="text-primary-ink" aria-hidden />}
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-3 flex items-center gap-2 border-t border-line pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("settings.newFarm")} maxLength={120} aria-label={t("settings.newFarm")} />
        <Button type="submit" busy={busy} disabled={!name.trim()} icon={<Plus size={18} aria-hidden />}>
          <span className="hidden sm:inline">{t("common.add")}</span>
        </Button>
      </form>
    </Panel>
  );
}
