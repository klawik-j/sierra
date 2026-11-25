import { ArrowLeft, ChevronDown, ClipboardList, FileText, Gauge, Link2, Pencil, Plus, StickyNote, Trash2, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { assetStatuses, isOpenStatus, meterKinds, type AssetDetailDto, type AssetStatus, type MeterKind } from "@sierra/shared";
import { ContactButtons, MapLink } from "../components/ContactActions";
import { assetDeadlines, assetIcon, AssetStatusBadge, DueBadge } from "../components/domain";
import { AddFileButton, DocumentList, Gallery } from "../components/Photos";
import { useContactItems } from "../components/Pickers";
import { Button, Card, cx, EmptyState, Field, IconButton, Input, Modal, PageLoader, Section, Select, useConfirm } from "../components/ui";
import { useForms } from "../features/forms";
import { smartSort, TicketList } from "../features/TicketRow";
import { todayStr, useFmt } from "../lib/format";
import { label, useT } from "../lib/i18n";
import { useOrg } from "../lib/org";
import { useAct, useAsset, useContacts, useNotes, useOrgApi, useTickets } from "../lib/queries";

export function AssetPage() {
  const t = useT();
  const { assetId } = useParams();
  const asset = useAsset(assetId);
  if (asset.isError)
    return (
      <EmptyState
        title={t("assets.notFound")}
        action={
          <Link to="/machines" className="font-bold text-primary-ink underline">
            {t("nav.machines")}
          </Link>
        }
      />
    );
  if (!asset.data) return <PageLoader />;
  return <AssetView asset={asset.data} />;
}

function Fact({ label: text, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold uppercase tracking-wide text-muted">{text}</dt>
      <dd className="mt-0.5 break-words text-[0.9375rem] font-semibold">{children}</dd>
    </div>
  );
}

function AssetView({ asset }: { asset: AssetDetailDto }) {
  const t = useT();
  const fmt = useFmt();
  const { can, member } = useOrg();
  const navigate = useNavigate();
  const forms = useForms();
  const orgApi = useOrgApi();
  const act = useAct();
  const confirm = useConfirm();
  const tickets = useTickets();
  const notes = useNotes();
  const contacts = useContacts();
  const [showClosed, setShowClosed] = useState(false);
  const [linking, setLinking] = useState(false);

  const manage = can("assets.manage");
  const machine = asset.kind === "machine";
  const Icon = assetIcon(asset);
  const d = asset.details;
  const owner = { ownerType: "asset" as const, ownerId: asset.id };
  const listPath = machine ? "/machines" : "/buildings";

  const related = useMemo(() => (tickets.data ?? []).filter((x) => x.assetIds.includes(asset.id)).sort(smartSort), [tickets.data, asset.id]);
  const open = related.filter((x) => isOpenStatus(x.status));
  const closed = related.filter((x) => !isOpenStatus(x.status));
  const linkedNotes = (notes.data ?? []).filter((n) => n.assetId === asset.id);
  const linkedContacts = asset.contacts.map((l) => ({ link: l, contact: contacts.data?.find((c) => c.id === l.contactId) })).filter((x) => x.contact);
  const deadlines = machine ? assetDeadlines(asset, Infinity) : [];
  const docs = asset.files.filter((f) => !f.isImage);

  const remove = async () => {
    if (!(await confirm({ title: t("assets.deleteTitle"), message: t("assets.deleteText", { name: asset.name }), confirmLabel: t("common.delete"), danger: true }))) return;
    if (await act(() => orgApi.del(`/assets/${asset.id}`))) navigate(listPath, { replace: true });
  };

  return (
    <>
      <Link to={listPath} className="-ml-1 mb-3 inline-flex min-h-9 items-center gap-1.5 rounded-control px-1 text-sm font-bold text-muted hover:text-fg">
        <ArrowLeft size={17} aria-hidden />
        {t(machine ? "nav.machines" : "nav.buildings")}
      </Link>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center lg:mb-8">
        <div className="aspect-[16/9] w-full overflow-hidden rounded-card border border-line bg-surface-2 sm:aspect-square sm:w-36 lg:w-44">
          {asset.coverFileId ? (
            <img src={orgApi.fileUrl(asset.coverFileId, "preview")} alt="" className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center bg-gradient-to-br from-primary-soft to-surface-2 text-primary-ink/50">
              <Icon size={64} strokeWidth={1.25} aria-hidden />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <AssetStatusBadge status={asset.status} />
            <span className="text-sm font-semibold text-muted">{label(t, "assetType", asset.type)}</span>
          </div>
          <h1 className="mt-1.5 text-2xl font-extrabold leading-tight tracking-tight lg:text-3xl">{asset.name}</h1>
          <div className="mt-3.5 flex flex-wrap gap-2">
            {can("tickets.create") && (
              <Button variant="primary" icon={<Plus size={18} strokeWidth={2.5} aria-hidden />} onClick={() => forms.open({ kind: "ticket", preset: { assetIds: [asset.id] } })}>
                {t("ticket.new")}
              </Button>
            )}
            <Button icon={<StickyNote size={18} aria-hidden />} onClick={() => forms.open({ kind: "note", preset: { assetId: asset.id } })}>
              {t("notes.new")}
            </Button>
            {manage && (
              <Button icon={<Pencil size={17} aria-hidden />} onClick={() => forms.open({ kind: "asset", asset, assetKind: asset.kind })}>
                {t("common.edit")}
              </Button>
            )}
            {manage && (
              <IconButton label={t("common.delete")} onClick={remove}>
                <Trash2 size={19} aria-hidden />
              </IconButton>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-8">
        <div className="grid grid-cols-1 content-start gap-6">
          <Section title={t("assets.tickets")} count={open.length}>
            {open.length ? <TicketList tickets={open} hideAssets /> : <EmptyState icon={<ClipboardList size={22} aria-hidden />} title={t("assets.noOpenTickets")} />}
            {closed.length > 0 && (
              <div className="mt-3">
                <button type="button" onClick={() => setShowClosed((v) => !v)} aria-expanded={showClosed} className="inline-flex min-h-9 items-center gap-1.5 text-sm font-bold text-muted hover:text-fg">
                  <ChevronDown size={16} className={cx("transition-transform duration-150", showClosed && "rotate-180")} aria-hidden />
                  {t("assets.ticketHistory", { n: closed.length })}
                </button>
                {showClosed && (
                  <div className="mt-2">
                    <TicketList tickets={closed} hideAssets />
                  </div>
                )}
              </div>
            )}
          </Section>

          <Section title={t("photos.title")} count={asset.files.filter((f) => f.isImage).length || undefined}>
            <Gallery
              files={asset.files}
              owner={owner}
              canEdit={manage}
              coverId={asset.coverFileId}
              onSetCover={(fileId) => act(() => orgApi.post(`/assets/${asset.id}/cover`, { fileId }), t("common.saved"))}
              columns="grid-cols-3 sm:grid-cols-4 xl:grid-cols-5"
            />
            {!manage && !asset.files.some((f) => f.isImage) && <p className="text-sm text-muted">{t("photos.none")}</p>}
          </Section>

          {(docs.length > 0 || manage) && (
            <Section title={t("assets.documents")} count={docs.length || undefined} actions={manage && <AddFileButton owner={owner} tag="document" accept="application/pdf" label={t("photos.addDocument")} icon={<FileText size={16} aria-hidden />} />}>
              {docs.length ? <DocumentList files={docs} canEdit={manage} /> : <p className="text-sm text-muted">{t("assets.documentsHint")}</p>}
            </Section>
          )}

          {linkedNotes.length > 0 && (
            <Section title={t("nav.notes")} count={linkedNotes.length}>
              <ul className="grid grid-cols-1 gap-2">
                {linkedNotes.map((n) => (
                  <li key={n.id}>
                    <button type="button" onClick={() => forms.open({ kind: "note", note: n })} className="block w-full rounded-card border border-line bg-surface p-3.5 text-left shadow-raise hover:border-primary">
                      {n.title && <span className="block text-[0.9375rem] font-bold">{n.title}</span>}
                      <span className="line-clamp-3 whitespace-pre-wrap text-sm">{n.body}</span>
                      <span className="mt-1.5 block text-xs text-muted">
                        {member(n.authorId)?.name ?? "—"} · {fmt.ago(n.updatedAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        <div className="grid grid-cols-1 content-start gap-6">
          <Section title={t("assets.details")}>
            <Card className="p-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5">
                {machine ? (
                  <>
                    {d.make && <Fact label={t("assets.make")}>{d.make}</Fact>}
                    {d.model && <Fact label={t("assets.model")}>{d.model}</Fact>}
                    {d.year && <Fact label={t("assets.year")}>{d.year}</Fact>}
                    {d.plate && <Fact label={t("assets.plate")}>{d.plate}</Fact>}
                    {d.vin && (
                      <div className="col-span-2">
                        <Fact label={t("assets.vin")}>
                          <span className="font-mono text-sm">{d.vin}</span>
                        </Fact>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {d.areaM2 && <Fact label={t("assets.area")}>{fmt.number(d.areaM2)} m²</Fact>}
                    {d.year && <Fact label={t("assets.yearBuilt")}>{d.year}</Fact>}
                    {d.address && (
                      <div className="col-span-2">
                        <Fact label={t("assets.address")}>
                          <MapLink address={d.address} />
                        </Fact>
                      </div>
                    )}
                  </>
                )}
                {manage && (
                  <div className="col-span-2">
                    <Field label={t("assets.status")}>
                      <Select value={asset.status} onChange={(e) => act(() => orgApi.patch(`/assets/${asset.id}`, { status: e.target.value as AssetStatus }))}>
                        {assetStatuses.map((s) => (
                          <option key={s} value={s}>
                            {t(`assetStatus.${s}`)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                )}
              </dl>
              {asset.notes && <p className="mt-4 whitespace-pre-wrap border-t border-line pt-3.5 text-sm leading-relaxed">{asset.notes}</p>}
            </Card>
          </Section>

          {machine && (
            <Section title={t("assets.deadlines")}>
              {deadlines.length ? (
                <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-raise">
                  {deadlines.map((x) => (
                    <li key={x.kind} className="flex min-h-12 items-center gap-3 px-4 py-2">
                      <span className="flex-1 text-[0.9375rem] font-semibold">{t(`assets.deadline.${x.kind}`)}</span>
                      {fmt.due(x.day) !== fmt.day(x.day) && <span className="text-sm text-muted">{fmt.day(x.day)}</span>}
                      <DueBadge day={x.day} />
                    </li>
                  ))}
                </ul>
              ) : (
                <Card className="px-4 py-4 text-sm text-muted">{t("assets.deadlinesNone")}</Card>
              )}
            </Section>
          )}

          {machine && <Readings asset={asset} />}

          <Section
            title={t("nav.contacts")}
            count={linkedContacts.length || undefined}
            actions={
              manage && (
                <Button size="sm" icon={<Link2 size={16} aria-hidden />} onClick={() => setLinking(true)}>
                  {t("assets.linkContact")}
                </Button>
              )
            }
          >
            {linkedContacts.length ? (
              <ul className="grid grid-cols-1 gap-2">
                {linkedContacts.map(({ link, contact }) => (
                  <li key={link.contactId} className="rounded-card border border-line bg-surface p-3.5 shadow-raise">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.9375rem] font-bold">{contact!.name}</p>
                        <p className="text-sm text-muted">{[link.role, contact!.company].filter(Boolean).join(" · ") || t(`contactCat.${contact!.category}`)}</p>
                      </div>
                      {manage && (
                        <IconButton label={t("assets.unlinkContact")} className="-mr-1.5 -mt-1.5 size-9" onClick={() => act(() => orgApi.del(`/assets/${asset.id}/contacts/${link.contactId}`))}>
                          <X size={16} aria-hidden />
                        </IconButton>
                      )}
                    </div>
                    <ContactButtons who={contact!} subject={asset.name} className="mt-2.5" />
                  </li>
                ))}
              </ul>
            ) : (
              <Card className="px-4 py-4 text-sm text-muted">{t("assets.contactsHint")}</Card>
            )}
          </Section>
        </div>
      </div>

      {linking && <LinkContact assetId={asset.id} linked={asset.contacts.map((c) => c.contactId)} onClose={() => setLinking(false)} />}
    </>
  );
}

function Readings({ asset }: { asset: AssetDetailDto }) {
  const t = useT();
  const fmt = useFmt();
  const { member, user, can } = useOrg();
  const orgApi = useOrgApi();
  const act = useAct();
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<MeterKind>(asset.km !== null && asset.hours === null ? "km" : "hours");
  const [value, setValue] = useState("");
  const [date, setDate] = useState(todayStr());
  const unit = (k: MeterKind) => (k === "hours" ? t("assets.unit.hours") : "km");
  const parsed = Number(value.replace(",", "."));
  const valid = value.trim() !== "" && Number.isFinite(parsed) && parsed >= 0;

  const save = async () => {
    if (!valid) return;
    if (await act(() => orgApi.post(`/assets/${asset.id}/readings`, { kind, value: parsed, recordedAt: date }))) {
      setValue("");
      setAdding(false);
    }
  };

  return (
    <Section
      title={t("assets.readings")}
      actions={
        !adding && (
          <Button size="sm" icon={<Plus size={16} aria-hidden />} onClick={() => setAdding(true)}>
            {t("assets.addReading")}
          </Button>
        )
      }
    >
      <Card className="overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-line">
          {meterKinds.map((k) => {
            const current = k === "hours" ? asset.hours : asset.km;
            return (
              <div key={k} className="p-4">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
                  <Gauge size={14} aria-hidden />
                  {t(`assets.meter.${k}`)}
                </p>
                <p className="mt-1 text-2xl font-extrabold tabular-nums tracking-tight">
                  {current !== null ? fmt.number(current) : "—"} <span className="text-sm font-semibold text-muted">{current !== null && unit(k)}</span>
                </p>
              </div>
            );
          })}
        </div>
        {adding && (
          <form
            className="grid grid-cols-2 gap-2 border-t border-line p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <Select value={kind} onChange={(e) => setKind(e.target.value as MeterKind)} aria-label={t("assets.meter")}>
              {meterKinds.map((k) => (
                <option key={k} value={k}>
                  {t(`assets.meter.${k}`)}
                </option>
              ))}
            </Select>
            <Input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder={unit(kind)} aria-label={t("assets.readingValue")} autoFocus />
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayStr()} aria-label={t("ticket.date")} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAdding(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" variant="primary" disabled={!valid}>
                {t("common.save")}
              </Button>
            </div>
          </form>
        )}
        {asset.readings.length > 0 && (
          <details className="group border-t border-line">
            <summary className="flex min-h-10 list-none items-center gap-1.5 px-4 text-sm font-bold text-muted hover:text-fg [&::-webkit-details-marker]:hidden">
              <ChevronDown size={16} className="transition-transform duration-150 group-open:rotate-180" aria-hidden />
              {t("assets.readingHistory", { n: asset.readings.length })}
            </summary>
            <ul className="divide-y divide-line border-t border-line">
              {asset.readings.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-1 pl-4 pr-1 text-sm">
                  <span className="w-24 shrink-0 font-bold tabular-nums">
                    {fmt.number(r.value)} {unit(r.kind)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-muted">
                    {fmt.day(r.recordedAt)} · {member(r.recordedBy)?.name ?? "—"}
                  </span>
                  {r.recordedBy === user.id || can("assets.manage") ? (
                    <IconButton label={t("common.delete")} className="size-9" onClick={() => act(() => orgApi.del(`/assets/${asset.id}/readings/${r.id}`))}>
                      <X size={15} aria-hidden />
                    </IconButton>
                  ) : (
                    <span className="size-9" />
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>
    </Section>
  );
}

function LinkContact({ assetId, linked, onClose }: { assetId: string; linked: string[]; onClose: () => void }) {
  const t = useT();
  const forms = useForms();
  const orgApi = useOrgApi();
  const act = useAct();
  const items = useContactItems().filter((c) => !linked.includes(c.id));
  const [contactId, setContactId] = useState(items[0]?.id ?? "");
  const [role, setRole] = useState("");
  const save = async () => {
    if (!contactId) return;
    if (await act(() => orgApi.put(`/assets/${assetId}/contacts/${contactId}`, { role }))) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      onSubmit={save}
      title={t("assets.linkContact")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={!contactId}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      {items.length ? (
        <div className="grid grid-cols-1 gap-4">
          <Field label={t("contacts.one")}>
            <Select value={contactId} onChange={(e) => setContactId(e.target.value)}>
              {items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                  {c.sub ? ` – ${c.sub}` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("assets.contactRole")} hint={t("assets.contactRoleHint")}>
            <Input value={role} onChange={(e) => setRole(e.target.value)} maxLength={80} />
          </Field>
        </div>
      ) : (
        <EmptyState
          title={t("contacts.empty")}
          action={
            <Button
              variant="primary"
              onClick={() => {
                onClose();
                forms.open({ kind: "contact" });
              }}
            >
              {t("contacts.new")}
            </Button>
          }
        />
      )}
    </Modal>
  );
}
