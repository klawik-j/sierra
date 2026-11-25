import { Copy, Link2, Share2, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { manageableRoles, type InvitationDto, type MemberDto, type Role } from "@sierra/shared";
import { ContactIcons, MailLink, PhoneLink } from "../components/ContactActions";
import { RoleBadge } from "../components/domain";
import { Avatar, Badge, Button, Card, Field, IconButton, Input, Modal, PageHeader, Section, Select, useConfirm } from "../components/ui";
import { useFmt } from "../lib/format";
import { useT } from "../lib/i18n";
import { useOrg } from "../lib/org";
import { useAct, useInvitations, useOrgApi } from "../lib/queries";
import { useToast } from "../lib/toast";
import { useFormErrors, type FieldErrors } from "../lib/validation";

const inviteUrl = (token: string) => `${window.location.origin}/invite/${token}`;

export function TeamPage() {
  const t = useT();
  const { members, role, can, user, org } = useOrg();
  const manage = can("members.manage");
  const invitations = useInvitations(manage);
  const [adding, setAdding] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<MemberDto | null>(null);
  const grantable = manageableRoles(role);
  const active = members.filter((m) => m.active);
  const inactive = members.filter((m) => !m.active);

  const row = (m: MemberDto) => (
    <li key={m.userId} className="flex items-center gap-3 px-3.5 py-3 sm:px-4">
      <Avatar name={m.name} size={40} className="ring-0" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-[0.9375rem] font-bold">{m.name}</span>
          {m.userId === user.id && <span className="text-sm text-muted">({t("common.you")})</span>}
          <RoleBadge role={m.role} />
          {!m.active && <Badge tone="muted">{t("team.inactive")}</Badge>}
        </p>
        <div className="mt-0.5 hidden flex-wrap gap-x-4 text-sm sm:flex">
          {m.phone && <PhoneLink phone={m.phone} />}
          <MailLink email={m.email} />
        </div>
        <p className="truncate text-sm text-muted sm:hidden">{m.phone ?? m.email}</p>
      </div>
      {m.userId !== user.id && m.active && (
        <span className="sm:hidden">
          <ContactIcons who={{ phone: m.phone, email: m.phone ? null : m.email }} name={m.name} />
        </span>
      )}
      {manage && grantable.includes(m.role) && (
        <Button size="sm" onClick={() => setEditing(m)}>
          {t("team.manage")}
        </Button>
      )}
    </li>
  );

  return (
    <>
      <PageHeader
        title={t("nav.team")}
        subtitle={org.name}
        actions={
          manage && (
            <>
              <Button icon={<UserPlus size={18} aria-hidden />} onClick={() => setAdding(true)}>
                {t("team.addAccount")}
              </Button>
              <Button variant="primary" icon={<Link2 size={18} aria-hidden />} onClick={() => setInviting(true)}>
                {t("team.invite")}
              </Button>
            </>
          )
        }
      />
      <div className="grid max-w-3xl grid-cols-1 gap-6">
        <Section title={t("team.members")} count={active.length}>
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-raise">{active.map(row)}</ul>
        </Section>

        {manage && (invitations.data?.length ?? 0) > 0 && (
          <Section title={t("team.pendingInvites")} count={invitations.data!.length}>
            <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-raise">
              {invitations.data!.map((inv) => (
                <InviteRow key={inv.id} invitation={inv} />
              ))}
            </ul>
          </Section>
        )}

        {manage && inactive.length > 0 && (
          <Section title={t("team.former")} count={inactive.length}>
            <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface opacity-80 shadow-raise">{inactive.map(row)}</ul>
          </Section>
        )}

        <Card className="p-4 text-sm text-muted">
          <p className="mb-2 font-bold text-fg">{t("team.rolesTitle")}</p>
          <ul className="grid grid-cols-1 gap-1.5">
            {(["owner", "admin", "employee"] as const).map((r) => (
              <li key={r} className="flex gap-2">
                <span className="w-28 shrink-0">
                  <RoleBadge role={r} />
                </span>
                <span>{t(`team.roleHint.${r}`)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {adding && <AddMember roles={grantable} onClose={() => setAdding(false)} />}
      {inviting && <Invite roles={grantable} onClose={() => setInviting(false)} />}
      {editing && <ManageMember member={editing} roles={grantable} onClose={() => setEditing(null)} />}
    </>
  );
}

function ShareLink({ url }: { url: string }) {
  const t = useT();
  const toast = useToast();
  const { org } = useOrg();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.push(t("team.linkCopied"));
    } catch {
      toast.push(t("team.copyFailed"), "error");
    }
  };
  return (
    <div className="flex items-center gap-2">
      <Input readOnly value={url} onFocus={(e) => e.target.select()} aria-label={t("team.inviteLink")} className="min-w-0 flex-1 text-sm" />
      <Button icon={<Copy size={17} aria-hidden />} onClick={copy}>
        {t("team.copy")}
      </Button>
      {typeof navigator.share === "function" && (
        <IconButton label={t("team.share")} onClick={() => void navigator.share({ title: "Sierra", text: t("team.shareText", { org: org.name }), url }).catch(() => undefined)}>
          <Share2 size={19} aria-hidden />
        </IconButton>
      )}
    </div>
  );
}

function InviteRow({ invitation }: { invitation: InvitationDto }) {
  const t = useT();
  const fmt = useFmt();
  const orgApi = useOrgApi();
  const act = useAct();
  return (
    <li className="grid grid-cols-1 gap-2 px-3.5 py-3 sm:px-4">
      <div className="flex items-center gap-2">
        <RoleBadge role={invitation.role} />
        <span className="min-w-0 flex-1 truncate text-sm text-muted">
          {invitation.email ? `${invitation.email} · ` : ""}
          {t("team.inviteExpires", { date: fmt.day(invitation.expiresAt) })}
        </span>
        <IconButton label={t("team.revoke")} className="size-9" onClick={() => act(() => orgApi.del(`/invitations/${invitation.id}`))}>
          <Trash2 size={17} aria-hidden />
        </IconButton>
      </div>
      <ShareLink url={inviteUrl(invitation.token)} />
    </li>
  );
}

function RoleSelect({ value, onChange, roles }: { value: Role; onChange: (r: Role) => void; roles: readonly Role[] }) {
  const t = useT();
  return (
    <Field label={t("team.role")} hint={t(`team.roleHint.${value}`)}>
      <Select value={value} onChange={(e) => onChange(e.target.value as Role)}>
        {roles.map((r) => (
          <option key={r} value={r}>
            {t(`role.${r}`)}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function Invite({ roles, onClose }: { roles: readonly Role[]; onClose: () => void }) {
  const t = useT();
  const orgApi = useOrgApi();
  const act = useAct();
  const [role, setRole] = useState<Role>("employee");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const create = async () => {
    setBusy(true);
    const res = await act(() => orgApi.post<{ token: string }>("/invitations", { role }));
    setBusy(false);
    if (res) setToken(res.token);
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={t("team.invite")}
      footer={
        token ? (
          <Button variant="primary" onClick={onClose}>
            {t("common.done")}
          </Button>
        ) : (
          <Button variant="primary" busy={busy} onClick={create}>
            {t("team.createLink")}
          </Button>
        )
      }
    >
      {token ? (
        <div className="grid grid-cols-1 gap-3">
          <p className="text-[0.9375rem]">{t("team.inviteReady")}</p>
          <ShareLink url={inviteUrl(token)} />
          <p className="text-sm text-muted">{t("team.inviteReadyHint")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          <p className="text-[0.9375rem] text-muted">{t("team.inviteText")}</p>
          <RoleSelect value={role} onChange={setRole} roles={roles} />
        </div>
      )}
    </Modal>
  );
}

function AddMember({ roles, onClose }: { roles: readonly Role[]; onClose: () => void }) {
  const t = useT();
  const orgApi = useOrgApi();
  const act = useAct();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: "", email: "", phone: "", password: "", role: "employee" as Role });
  const form = useFormErrors({ name: t("auth.name"), email: t("auth.email"), phone: t("contacts.phone"), password: t("team.tempPassword"), role: t("team.role") });
  const edit = (patch: Partial<typeof f>) => {
    for (const key of Object.keys(patch)) form.clear(key);
    setF((prev) => ({ ...prev, ...patch }));
  };
  const submit = async () => {
    const found: FieldErrors = {};
    if (!f.name.trim()) found.name = t("invalid.required");
    if (!f.email.trim()) found.email = t("invalid.required");
    if (f.password.length < 8) found.password = t("invalid.minLength", { n: 8 });
    if (!form.check(found)) return;
    setBusy(true);
    const ok = await act(() => orgApi.post("/members", f), t("team.added"), form);
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      onSubmit={submit}
      title={t("team.addAccount")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="primary" busy={busy}>
            {t("team.addAccount")}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4">
        <p className="text-sm text-muted">{t("team.addAccountText")}</p>
        <Field label={t("auth.name")} error={form.of("name")}>
          <Input value={f.name} onChange={(e) => edit({ name: e.target.value })} maxLength={120} autoComplete="off" />
        </Field>
        <Field label={t("auth.email")} error={form.of("email")}>
          <Input value={f.email} onChange={(e) => edit({ email: e.target.value })} autoComplete="off" inputMode="email" autoCapitalize="none" />
        </Field>
        <Field label={t("contacts.phone")} error={form.of("phone")}>
          <Input type="tel" value={f.phone} onChange={(e) => edit({ phone: e.target.value })} autoComplete="off" inputMode="tel" />
        </Field>
        <Field label={t("team.tempPassword")} hint={t("auth.passwordHint")} error={form.of("password")}>
          <Input value={f.password} onChange={(e) => edit({ password: e.target.value })} autoComplete="off" />
        </Field>
        <RoleSelect value={f.role} onChange={(role) => edit({ role })} roles={roles} />
      </div>
    </Modal>
  );
}

function ManageMember({ member, roles, onClose }: { member: MemberDto; roles: readonly Role[]; onClose: () => void }) {
  const t = useT();
  const orgApi = useOrgApi();
  const act = useAct();
  const confirm = useConfirm();
  const { user } = useOrg();
  const [role, setRole] = useState(member.role);
  const [password, setPassword] = useState("");
  const path = `/members/${member.userId}`;
  const resetPassword = async () => {
    if (await act(() => orgApi.post(`${path}/password`, { password }), t("team.passwordSet"))) setPassword("");
  };
  const save = async () => {
    if (role === member.role || (await act(() => orgApi.patch(path, { role }), t("common.saved")))) onClose();
  };
  const setActive = async (active: boolean) => {
    if (!active && !(await confirm({ title: t("team.deactivateTitle"), message: t("team.deactivateText", { name: member.name }), confirmLabel: t("team.deactivate"), danger: true }))) return;
    if (await act(() => orgApi.patch(path, { active }))) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      onSubmit={save}
      title={member.name}
      footer={
        <>
          {member.active ? (
            <Button variant="danger" className="mr-auto" onClick={() => setActive(false)}>
              {t("team.deactivate")}
            </Button>
          ) : (
            <Button className="mr-auto" onClick={() => setActive(true)}>
              {t("team.reactivate")}
            </Button>
          )}
          <Button type="submit" variant="primary">
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4">
        <RoleSelect value={role} onChange={setRole} roles={roles} />
        {member.active && member.userId !== user.id && (
          <Field label={t("team.resetPassword")} hint={t("team.resetPasswordHint")}>
            <span className="flex gap-2">
              <Input value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} autoComplete="off" placeholder={t("auth.passwordHint")} />
              <Button disabled={password.length < 8} onClick={resetPassword}>
                {t("team.setPassword")}
              </Button>
            </span>
          </Field>
        )}
        <p className="text-sm text-muted">{t("team.deactivateHint")}</p>
      </div>
    </Modal>
  );
}
