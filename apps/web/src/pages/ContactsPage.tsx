import { Contact, Pencil, Plus, Search } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { contactCategories, type ContactCategory, type ContactDto } from "@sierra/shared";
import { ContactButtons, MailLink, MapLink, PhoneLink } from "../components/ContactActions";
import { Avatar, Badge, Button, Chip, EmptyState, IconButton, Input, PageHeader, PageLoader } from "../components/ui";
import { useForms } from "../features/forms";
import { useT } from "../lib/i18n";
import { useOrg } from "../lib/org";
import { useAssets, useContacts } from "../lib/queries";

export function ContactsPage() {
  const t = useT();
  const { can } = useOrg();
  const forms = useForms();
  const contacts = useContacts();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const category = (params.get("category") ?? "") as ContactCategory | "";
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const all = contacts.data ?? [];
  const needle = q.trim().toLowerCase();
  const shown = all.filter((c) => (!category || c.category === category) && (!needle || `${c.name} ${c.company ?? ""} ${c.phone ?? ""} ${c.phone2 ?? ""} ${c.email ?? ""} ${c.address ?? ""} ${c.notes ?? ""}`.toLowerCase().includes(needle)));
  const used = contactCategories.filter((c) => all.some((x) => x.category === c));
  const manage = can("contacts.manage");

  return (
    <>
      <PageHeader
        title={t("nav.contacts")}
        subtitle={t("contacts.subtitle")}
        actions={
          manage && (
            <Button variant="primary" icon={<Plus size={19} strokeWidth={2.5} aria-hidden />} onClick={() => forms.open({ kind: "contact" })}>
              {t("contacts.new")}
            </Button>
          )
        }
      />
      {all.length > 0 && (
        <div className="mb-4 grid grid-cols-1 gap-2.5">
          <div className="relative sm:max-w-sm">
            <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <Input value={q} onChange={(e) => set("q", e.target.value)} placeholder={t("contacts.searchPlaceholder")} aria-label={t("common.search")} className="pl-10" />
          </div>
          {used.length > 1 && (
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:flex-wrap sm:px-0">
              <Chip active={!category} onClick={() => set("category", "")}>
                {t("common.all")}
              </Chip>
              {used.map((c) => (
                <Chip key={c} active={category === c} onClick={() => set("category", category === c ? "" : c)}>
                  {t(`contactCat.${c}`)}
                </Chip>
              ))}
            </div>
          )}
        </div>
      )}
      {contacts.isPending ? (
        <PageLoader />
      ) : shown.length ? (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {shown.map((c) => (
            <li key={c.id}>
              <ContactCard contact={c} canEdit={manage} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<Contact size={24} aria-hidden />}
          title={all.length ? t("common.nothingFound") : t("contacts.empty")}
          text={all.length ? undefined : t("contacts.emptyText")}
          action={
            !all.length && manage ? (
              <Button variant="primary" icon={<Plus size={18} aria-hidden />} onClick={() => forms.open({ kind: "contact" })}>
                {t("contacts.new")}
              </Button>
            ) : undefined
          }
        />
      )}
    </>
  );
}

function ContactCard({ contact: c, canEdit }: { contact: ContactDto; canEdit: boolean }) {
  const t = useT();
  const forms = useForms();
  const assets = useAssets();
  const linked = c.assets.map((l) => ({ ...l, asset: assets.data?.find((a) => a.id === l.assetId) })).filter((l) => l.asset);
  return (
    <article className="flex h-full flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-raise">
      <header className="flex items-start gap-3">
        <Avatar name={c.name} size={44} className="ring-0" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-bold leading-snug">{c.name}</h2>
          {c.company && <p className="truncate text-sm text-muted">{c.company}</p>}
          <Badge tone="muted" className="mt-1">
            {t(`contactCat.${c.category}`)}
          </Badge>
        </div>
        {canEdit && (
          <IconButton label={`${t("common.edit")}: ${c.name}`} className="-mr-2 -mt-2" onClick={() => forms.open({ kind: "contact", contact: c })}>
            <Pencil size={17} aria-hidden />
          </IconButton>
        )}
      </header>
      {(c.phone || c.phone2 || c.email || c.address) && (
        <div className="grid grid-cols-1 gap-0.5 text-[0.9375rem]">
          {c.phone && <PhoneLink phone={c.phone} />}
          {c.phone2 && <PhoneLink phone={c.phone2} />}
          {c.email && <MailLink email={c.email} />}
          {c.address && <MapLink address={c.address} />}
        </div>
      )}
      {c.notes && <p className="whitespace-pre-wrap text-sm text-muted">{c.notes}</p>}
      {linked.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {linked.map((l) => (
            <Link key={l.assetId} to={`/assets/${l.assetId}`} className="inline-flex min-h-7 items-center rounded-full bg-surface-3 px-2.5 text-xs font-semibold hover:bg-primary-soft hover:text-primary-ink" title={l.role ?? undefined}>
              {l.asset!.name}
            </Link>
          ))}
        </div>
      )}
      <ContactButtons who={c} className="mt-auto border-t border-line pt-3" />
    </article>
  );
}
