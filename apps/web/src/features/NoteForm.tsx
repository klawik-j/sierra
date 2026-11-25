import { ClipboardList, ImagePlus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { NoteDto } from "@sierra/shared";
import { Gallery } from "../components/Photos";
import { MultiPick, useAssetItems } from "../components/Pickers";
import { appendText, Button, DictateButton, Field, Group, Input, Modal, Textarea, Toggle, useConfirm } from "../components/ui";
import { useT } from "../lib/i18n";
import { useOrg } from "../lib/org";
import { useAct, useOrgApi } from "../lib/queries";
import { useTicketDrawer } from "./forms";

interface Props {
  note?: NoteDto;
  preset?: { assetId?: string; ticketId?: string; contactId?: string };
  onClose: () => void;
}

export function NoteForm({ note, preset, onClose }: Props) {
  const t = useT();
  const { can, user } = useOrg();
  const orgApi = useOrgApi();
  const act = useAct();
  const confirm = useConfirm();
  const drawer = useTicketDrawer();
  const assetItems = useAssetItems();
  const mine = !note || note.authorId === user.id;
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState(() => ({
    title: note?.title ?? "",
    body: note?.body ?? "",
    shared: note?.shared ?? false,
    assetId: note?.assetId ?? preset?.assetId ?? "",
  }));
  // Photos picked before the note exists are uploaded right after it is created.
  const [pending, setPending] = useState<File[]>([]);
  const previews = useMemo(() => pending.map((file) => URL.createObjectURL(file)), [pending]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);
  const fileInput = useRef<HTMLInputElement>(null);

  const submit = async () => {
    if (!f.body.trim() && !f.title.trim() && !pending.length) return;
    const body = { title: f.title, body: f.body, shared: f.shared, assetId: f.assetId || null, ticketId: note?.ticketId ?? preset?.ticketId ?? null, contactId: note?.contactId ?? preset?.contactId ?? null };
    setBusy(true);
    const ok = await act(async () => {
      if (note) return orgApi.patch(`/notes/${note.id}`, body);
      const { id } = await orgApi.post("/notes", body);
      for (const file of pending) await orgApi.upload(file, { ownerType: "note", ownerId: id });
      return true;
    }, t("common.saved"));
    setBusy(false);
    if (ok) onClose();
  };

  const remove = async () => {
    if (!note || !(await confirm({ title: t("notes.deleteTitle"), message: t("notes.deleteText"), confirmLabel: t("common.delete"), danger: true }))) return;
    if (await act(() => orgApi.del(`/notes/${note.id}`))) onClose();
  };

  const convert = async () => {
    if (!note) return;
    const res = await act(() => orgApi.post<{ id: string; key: string }>(`/notes/${note.id}/convert`));
    if (!res) return;
    onClose();
    drawer.open(res.id);
  };

  return (
    <Modal
      open
      onClose={onClose}
      onSubmit={mine ? submit : undefined}
      size="lg"
      title={note ? t("notes.edit") : t("notes.new")}
      footer={
        mine ? (
          <>
            {note && (
              <Button variant="danger" icon={<Trash2 size={18} aria-hidden />} onClick={remove} className="mr-auto" aria-label={t("common.delete")}>
                <span className="hidden sm:inline">{t("common.delete")}</span>
              </Button>
            )}
            {note && !note.ticketId && can("tickets.create") && (
              <Button icon={<ClipboardList size={18} aria-hidden />} onClick={convert}>
                {t("notes.convert")}
              </Button>
            )}
            <Button type="submit" variant="primary" busy={busy}>
              {t("common.save")}
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="grid grid-cols-1 gap-4">
        <Field label={t("notes.body")} action={mine ? <DictateButton onText={(text) => setF((p) => ({ ...p, body: appendText(p.body, text) }))} /> : undefined}>
          <Textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder={t("notes.bodyPlaceholder")} rows={6} readOnly={!mine} autoFocus={!note && window.matchMedia("(min-width: 640px)").matches} />
        </Field>
        <Field label={t("notes.title")}>
          <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={t("notes.titlePlaceholder")} maxLength={200} readOnly={!mine} />
        </Field>

        {note ? (
          (note.files.length > 0 || mine) && (
            <Group label={t("photos.title")}>
              <Gallery files={note.files} owner={{ ownerType: "note", ownerId: note.id }} canEdit={mine} />
            </Group>
          )
        ) : (
          <Group label={t("photos.title")}>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                setPending((p) => [...p, ...Array.from(e.target.files ?? [])]);
                e.target.value = "";
              }}
            />
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {previews.map((url, i) => (
                <div key={url} className="relative aspect-square overflow-hidden rounded-control bg-surface-3">
                  <img src={url} alt="" className="size-full object-cover" />
                  <button type="button" onClick={() => setPending((p) => p.filter((_, j) => j !== i))} className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-black/60 text-white" aria-label={t("common.remove")}>
                    <X size={15} aria-hidden />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => fileInput.current?.click()} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-control border-2 border-dashed border-line-strong/40 text-xs font-semibold text-muted hover:border-primary hover:bg-primary-soft hover:text-primary-ink">
                <ImagePlus size={22} aria-hidden />
                {t("photos.add")}
              </button>
            </div>
          </Group>
        )}

        {mine && (
          <>
            <MultiPick label={t("notes.linkedAsset")} addLabel={t("notes.linkAsset")} items={assetItems} value={f.assetId ? [f.assetId] : []} onChange={(ids) => setF({ ...f, assetId: ids[ids.length - 1] ?? "" })} multiple={false} emptyText={t("assets.empty")} />
            <Toggle label={t("notes.shared")} hint={t("notes.sharedHint")} checked={f.shared} onChange={(v) => setF({ ...f, shared: v })} />
          </>
        )}
      </div>
    </Modal>
  );
}
