import { Camera, ChevronLeft, ChevronRight, Download, FileText, ImagePlus, Star, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { fileTags, type FileDto, type FileTag } from "@sierra/shared";
import { useFmt } from "../lib/format";
import { useT } from "../lib/i18n";
import { useAct, useOrgApi } from "../lib/queries";
import { buttonClass, cx, IconButton, Spinner, useConfirm, useFocusTrap, useLayer } from "./ui";

type Owner = { ownerType: FileDto["ownerType"]; ownerId: string };

/** Uploads picked files one by one (phones produce large photos; the server resizes them). */
function useUploader(owner: Owner) {
  const orgApi = useOrgApi();
  const act = useAct();
  const [busy, setBusy] = useState(false);
  const upload = async (list: FileList | null, tag: FileTag) => {
    if (!list?.length) return;
    setBusy(true);
    try {
      await act(async () => {
        for (const file of Array.from(list)) await orgApi.upload(file, { ...owner, tag });
      });
    } finally {
      setBusy(false);
    }
  };
  return { upload, busy };
}

interface AddProps {
  owner: Owner;
  tag?: FileTag;
  label: string;
  /** "tile" is a dashed square that sits in a photo grid; "button" is a normal button. */
  look?: "tile" | "button";
  accept?: string;
  icon?: ReactNode;
}

export function AddFileButton({ owner, tag = "other", label, look = "button", accept = "image/*", icon }: AddProps) {
  const { upload, busy } = useUploader(owner);
  const input = useRef<HTMLInputElement>(null);
  const glyph = busy ? <Spinner className="size-5" /> : (icon ?? (look === "tile" ? <Camera size={22} aria-hidden /> : <ImagePlus size={18} aria-hidden />));
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple
        hidden
        onChange={(e) => {
          void upload(e.target.files, tag);
          e.target.value = "";
        }}
      />
      {look === "tile" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-control border-2 border-dashed border-line-strong/40 px-1 text-center text-xs font-semibold text-muted transition-colors duration-150 hover:border-primary hover:bg-primary-soft hover:text-primary-ink"
        >
          {glyph}
          {label}
        </button>
      ) : (
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className={buttonClass({ size: "sm" })}>
          {glyph}
          {label}
        </button>
      )}
    </>
  );
}

function Thumb({ file, onOpen, badge }: { file: FileDto; onOpen: () => void; badge?: ReactNode }) {
  const orgApi = useOrgApi();
  return (
    <button type="button" onClick={onOpen} className="group relative block aspect-square w-full overflow-hidden rounded-control bg-surface-3" aria-label={file.caption || file.name}>
      <img src={orgApi.fileUrl(file.id, "thumb")} alt={file.caption ?? ""} loading="lazy" className="size-full object-cover transition-transform duration-200 group-hover:scale-105" />
      {badge && <span className="absolute left-1.5 top-1.5">{badge}</span>}
    </button>
  );
}

interface LightboxProps {
  files: FileDto[];
  index: number;
  onIndex: (i: number | null) => void;
  canEdit: boolean;
  /** Show the before / after / other switch (tickets). */
  tags?: boolean;
  extraAction?: (file: FileDto) => ReactNode;
}

export function Lightbox({ files, index, onIndex, canEdit, tags, extraAction }: LightboxProps) {
  const t = useT();
  const fmt = useFmt();
  const orgApi = useOrgApi();
  const act = useAct();
  const confirm = useConfirm();
  const file = files[index];
  const close = () => onIndex(null);
  useLayer(true, close);
  const ref = useFocusTrap<HTMLDivElement>(true);
  const move = (delta: number) => onIndex((index + delta + files.length) % files.length);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") move(-1);
      if (e.key === "ArrowRight") move(1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });
  useEffect(() => {
    if (!file) onIndex(null);
  }, [file, onIndex]);
  if (!file) return null;

  const remove = async () => {
    if (!(await confirm({ title: t("photos.deleteTitle"), message: t("photos.deleteText"), confirmLabel: t("common.delete"), danger: true }))) return;
    await act(() => orgApi.del(`/files/${file.id}`));
    if (files.length <= 1) close();
    else onIndex(Math.min(index, files.length - 2));
  };

  const tool = "inline-flex size-tap items-center justify-center rounded-control text-white/85 hover:bg-white/15 hover:text-white";
  return createPortal(
    <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t("photos.viewer")} className="fixed inset-0 z-[80] flex animate-fade-in flex-col bg-black/95 text-white outline-none">
      <div className="flex shrink-0 items-center gap-1 px-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <span className="px-2 text-sm font-semibold tabular-nums text-white/80">
          {index + 1} / {files.length}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-white/60">{fmt.dateTime(file.createdAt)}</span>
        {extraAction?.(file)}
        <a href={orgApi.fileUrl(file.id, "download")} className={tool} aria-label={t("photos.download")} title={t("photos.download")}>
          <Download size={20} aria-hidden />
        </a>
        {canEdit && (
          <button type="button" onClick={remove} className={tool} aria-label={t("common.delete")} title={t("common.delete")}>
            <Trash2 size={20} aria-hidden />
          </button>
        )}
        <button type="button" onClick={close} className={tool} aria-label={t("common.close")} title={t("common.close")}>
          <X size={24} aria-hidden />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-2" onClick={close}>
        <img key={file.id} src={orgApi.fileUrl(file.id, "preview")} alt={file.caption ?? file.name} className="max-h-full max-w-full animate-fade-in rounded-control object-contain" onClick={(e) => e.stopPropagation()} />
        {files.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                move(-1);
              }}
              className={cx(tool, "absolute left-2 top-1/2 -translate-y-1/2 bg-black/40")}
              aria-label={t("photos.prev")}
            >
              <ChevronLeft size={26} aria-hidden />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                move(1);
              }}
              className={cx(tool, "absolute right-2 top-1/2 -translate-y-1/2 bg-black/40")}
              aria-label={t("photos.next")}
            >
              <ChevronRight size={26} aria-hidden />
            </button>
          </>
        )}
      </div>
      {tags && canEdit && (
        <div role="radiogroup" aria-label={t("photos.tag")} className="flex shrink-0 justify-center gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
          {fileTags
            .filter((x) => x !== "document")
            .map((tag) => (
              <button
                key={tag}
                type="button"
                role="radio"
                aria-checked={file.tag === tag}
                onClick={() => file.tag !== tag && act(() => orgApi.patch(`/files/${file.id}`, { tag }))}
                className={cx("min-h-10 rounded-full px-4 text-sm font-bold", file.tag === tag ? "bg-white text-black" : "bg-white/15 text-white hover:bg-white/25")}
              >
                {t(`photos.tag.${tag as "before" | "after" | "other"}`)}
              </button>
            ))}
        </div>
      )}
    </div>,
    document.body,
  );
}

/** PDFs and other non-image attachments. */
export function DocumentList({ files, canEdit }: { files: FileDto[]; canEdit: boolean }) {
  const t = useT();
  const orgApi = useOrgApi();
  const act = useAct();
  const confirm = useConfirm();
  if (!files.length) return null;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-control border border-line bg-surface">
      {files.map((f) => (
        <li key={f.id} className="flex items-center gap-2 pl-3">
          <FileText size={18} className="shrink-0 text-muted" aria-hidden />
          <a href={orgApi.fileUrl(f.id, "original")} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate py-2.5 text-sm font-semibold hover:underline">
            {f.name}
          </a>
          <span className="shrink-0 text-xs text-muted">{Math.max(1, Math.round(f.size / 1024))} kB</span>
          {canEdit && (
            <IconButton
              label={t("common.delete")}
              onClick={async () => {
                if (await confirm({ title: t("photos.deleteFileTitle"), message: f.name, confirmLabel: t("common.delete"), danger: true })) await act(() => orgApi.del(`/files/${f.id}`));
              }}
            >
              <Trash2 size={18} aria-hidden />
            </IconButton>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Plain photo grid with an "add" tile (machines, buildings, notes). */
export function Gallery({ files, owner, canEdit, coverId, onSetCover, columns = "grid-cols-3 sm:grid-cols-4" }: { files: FileDto[]; owner: Owner; canEdit: boolean; coverId?: string | null; onSetCover?: (id: string) => void; columns?: string }) {
  const t = useT();
  const images = files.filter((f) => f.isImage);
  const [open, setOpen] = useState<number | null>(null);
  if (!images.length && !canEdit) return null;
  return (
    <>
      <div className={cx("grid grid-cols-1 gap-2", columns)}>
        {images.map((f, i) => (
          <Thumb
            key={f.id}
            file={f}
            onOpen={() => setOpen(i)}
            badge={
              f.id === coverId ? (
                <span className="flex size-6 items-center justify-center rounded-full bg-accent text-on-accent" title={t("photos.cover")}>
                  <Star size={13} fill="currentColor" aria-hidden />
                </span>
              ) : undefined
            }
          />
        ))}
        {canEdit && <AddFileButton owner={owner} look="tile" label={t("photos.add")} />}
      </div>
      {open !== null && (
        <Lightbox
          files={images}
          index={open}
          onIndex={setOpen}
          canEdit={canEdit}
          extraAction={
            onSetCover && canEdit
              ? (f) =>
                  f.id !== coverId && (
                    <button type="button" onClick={() => onSetCover(f.id)} className="inline-flex min-h-tap items-center gap-1.5 rounded-control px-3 text-sm font-semibold text-white/85 hover:bg-white/15">
                      <Star size={18} aria-hidden />
                      {t("photos.setCover")}
                    </button>
                  )
              : undefined
          }
        />
      )}
    </>
  );
}

/** Ticket photos: "before" and "after" side by side, then everything else. */
export function BeforeAfter({ files, owner, canEdit }: { files: FileDto[]; owner: Owner; canEdit: boolean }) {
  const t = useT();
  const images = files.filter((f) => f.isImage);
  // One shared order so the viewer can page through all photos: before, after, other.
  const ordered = [...images.filter((f) => f.tag === "before"), ...images.filter((f) => f.tag === "after"), ...images.filter((f) => f.tag !== "before" && f.tag !== "after")];
  const [open, setOpen] = useState<number | null>(null);
  const column = (tag: "before" | "after", tone: string) => {
    const list = ordered.filter((f) => f.tag === tag);
    return (
      <div className="min-w-0 rounded-card border border-line bg-surface p-2.5">
        <div className="mb-2 flex items-center gap-2">
          <span className={cx("size-2.5 rounded-full", tone)} aria-hidden />
          <h3 className="text-sm font-bold">{t(`photos.tag.${tag}`)}</h3>
          <span className="text-xs font-semibold text-muted">{list.length || ""}</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {list.map((f) => (
            <Thumb key={f.id} file={f} onOpen={() => setOpen(ordered.indexOf(f))} />
          ))}
          {canEdit && <AddFileButton owner={owner} tag={tag} look="tile" label={t(`photos.add.${tag}`)} />}
          {!canEdit && !list.length && <p className="col-span-2 py-4 text-center text-xs text-muted">{t("photos.none")}</p>}
        </div>
      </div>
    );
  };
  const other = ordered.filter((f) => f.tag !== "before" && f.tag !== "after");
  return (
    <>
      <div className="grid grid-cols-2 gap-2.5">
        {column("before", "bg-warn")}
        {column("after", "bg-primary")}
      </div>
      {(other.length > 0 || canEdit) && (
        <div className="mt-2.5 grid grid-cols-4 gap-1.5 sm:grid-cols-5">
          {other.map((f) => (
            <Thumb key={f.id} file={f} onOpen={() => setOpen(ordered.indexOf(f))} />
          ))}
          {canEdit && <AddFileButton owner={owner} tag="other" look="tile" label={t("photos.add.other")} icon={<ImagePlus size={20} aria-hidden />} />}
        </div>
      )}
      {open !== null && <Lightbox files={ordered} index={open} onIndex={setOpen} canEdit={canEdit} tags />}
    </>
  );
}
