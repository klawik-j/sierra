import { ClipboardList, Lock, Plus, StickyNote, Users } from "lucide-react";
import { useState } from "react";
import type { NoteDto } from "@sierra/shared";
import { assetIcon } from "../components/domain";
import { appendText, Avatar, Button, Card, DictateButton, EmptyState, PageHeader, PageLoader, Segmented, Textarea, Toggle } from "../components/ui";
import { TicketLink, useForms } from "../features/forms";
import { useFmt } from "../lib/format";
import { useT } from "../lib/i18n";
import { useOrg } from "../lib/org";
import { useAct, useAssets, useNotes, useOrgApi, useTickets } from "../lib/queries";

type Filter = "all" | "mine" | "shared";

export function NotesPage() {
  const t = useT();
  const { user } = useOrg();
  const forms = useForms();
  const notes = useNotes();
  const [filter, setFilter] = useState<Filter>("all");
  const shown = (notes.data ?? []).filter((n) => (filter === "mine" ? n.authorId === user.id : filter === "shared" ? n.shared : true));

  return (
    <>
      <PageHeader
        title={t("nav.notes")}
        subtitle={t("notes.subtitle")}
        actions={
          <Button variant="primary" icon={<Plus size={19} strokeWidth={2.5} aria-hidden />} onClick={() => forms.open({ kind: "note" })} className="hidden lg:inline-flex">
            {t("notes.new")}
          </Button>
        }
      />
      <div className="grid grid-cols-1 gap-5">
        <QuickNote />
        <Segmented
          label={t("notes.filter")}
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: t("common.all") },
            { value: "mine", label: t("notes.filter.mine") },
            { value: "shared", label: t("notes.filter.shared") },
          ]}
          className="justify-self-start"
        />
        {notes.isPending ? (
          <PageLoader />
        ) : shown.length ? (
          <ul className="columns-1 gap-3 sm:columns-2 xl:columns-3 [&>li]:mb-3 [&>li]:break-inside-avoid">
            {shown.map((n) => (
              <li key={n.id}>
                <NoteCard note={n} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<StickyNote size={24} aria-hidden />} title={t("notes.empty")} text={t("notes.emptyText")} />
        )}
      </div>
    </>
  );
}

/** Fastest path from a thought to a saved note: tap the microphone, talk, save. */
function QuickNote() {
  const t = useT();
  const orgApi = useOrgApi();
  const act = useAct();
  const [body, setBody] = useState("");
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!body.trim()) return;
    setBusy(true);
    const ok = await act(() => orgApi.post("/notes", { body, shared }), t("notes.saved"));
    setBusy(false);
    if (ok) setBody("");
  };
  return (
    <Card className="overflow-hidden focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("notes.quickPlaceholder")} rows={2} aria-label={t("notes.new")} className="min-h-16 border-0 bg-transparent shadow-none focus:ring-0" />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-3 py-2">
          <DictateButton onText={(text) => setBody((p) => appendText(p, text))} />
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden sm:block">
              <Toggle label={t("notes.shared")} checked={shared} onChange={setShared} />
            </div>
            <Button type="submit" variant="primary" size="sm" busy={busy} disabled={!body.trim()}>
              {t("notes.save")}
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}

function NoteCard({ note }: { note: NoteDto }) {
  const t = useT();
  const fmt = useFmt();
  const { member, user } = useOrg();
  const forms = useForms();
  const orgApi = useOrgApi();
  const assets = useAssets();
  const tickets = useTickets();
  const author = member(note.authorId);
  const asset = assets.data?.find((a) => a.id === note.assetId);
  const ticket = tickets.data?.find((x) => x.id === note.ticketId);
  const images = note.files.filter((f) => f.isImage);
  const AssetIcon = asset ? assetIcon(asset) : null;
  return (
    <article className="overflow-hidden rounded-card border border-line bg-surface shadow-raise transition-colors duration-150 hover:border-primary">
      <button type="button" onClick={() => forms.open({ kind: "note", note })} className="block w-full p-4 text-left">
        {note.title && <h2 className="mb-1 text-base font-bold leading-snug">{note.title}</h2>}
        {note.body && <p className="line-clamp-[10] whitespace-pre-wrap break-words text-[0.9375rem] leading-relaxed">{note.body}</p>}
        {images.length > 0 && (
          <span className="mt-3 grid grid-cols-3 gap-1.5">
            {images.slice(0, 3).map((f, i) => (
              <span key={f.id} className="relative block aspect-square overflow-hidden rounded-control bg-surface-3">
                <img src={orgApi.fileUrl(f.id, "thumb")} alt="" loading="lazy" className="size-full object-cover" />
                {i === 2 && images.length > 3 && <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm font-bold text-white">+{images.length - 3}</span>}
              </span>
            ))}
          </span>
        )}
      </button>
      <footer className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line px-4 py-2.5 text-xs text-muted">
        <span className="flex min-w-0 items-center gap-1.5">
          <Avatar name={author?.name ?? "?"} size={20} className="ring-0" />
          <span className="truncate font-semibold">{note.authorId === user.id ? t("common.you") : (author?.name ?? "—")}</span>
        </span>
        <span>{fmt.ago(note.updatedAt)}</span>
        <span className="inline-flex items-center gap-1" title={t(note.shared ? "notes.sharedBadgeHint" : "notes.privateHint")}>
          {note.shared ? <Users size={13} aria-hidden /> : <Lock size={13} aria-hidden />}
          {t(note.shared ? "notes.sharedBadge" : "notes.privateBadge")}
        </span>
        {asset && AssetIcon && (
          <span className="inline-flex min-w-0 items-center gap-1 font-semibold text-primary-ink">
            <AssetIcon size={13} aria-hidden />
            <span className="truncate">{asset.name}</span>
          </span>
        )}
        {ticket && (
          <TicketLink ticketId={ticket.id} className="inline-flex items-center gap-1 font-bold text-primary-ink hover:underline">
            <ClipboardList size={13} aria-hidden />
            {ticket.key}
          </TicketLink>
        )}
      </footer>
    </article>
  );
}
