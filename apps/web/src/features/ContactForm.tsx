import { Trash2 } from "lucide-react";
import { useState } from "react";
import { contactCategories, type ContactCategory, type ContactDto } from "@sierra/shared";
import { appendText, Button, DictateButton, Field, Input, Modal, Select, Textarea, useConfirm } from "../components/ui";
import { useT } from "../lib/i18n";
import { useAct, useOrgApi } from "../lib/queries";
import { useFormErrors } from "../lib/validation";

export function ContactForm({ contact, onClose }: { contact?: ContactDto; onClose: () => void }) {
  const t = useT();
  const orgApi = useOrgApi();
  const act = useAct();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState(() => ({
    name: contact?.name ?? "",
    company: contact?.company ?? "",
    category: (contact?.category ?? "other") as ContactCategory,
    phone: contact?.phone ?? "",
    phone2: contact?.phone2 ?? "",
    email: contact?.email ?? "",
    address: contact?.address ?? "",
    website: contact?.website ?? "",
    notes: contact?.notes ?? "",
  }));
  const form = useFormErrors({
    name: t("contacts.name"),
    company: t("contacts.company"),
    category: t("contacts.category"),
    phone: t("contacts.phone"),
    phone2: t("contacts.phone2"),
    email: t("contacts.email"),
    address: t("contacts.address"),
    website: t("contacts.website"),
    notes: t("contacts.notes"),
  });
  const bind = (key: keyof typeof f) => ({
    value: f[key],
    onChange: (e: { target: { value: string } }) => {
      form.clear(key);
      setF((p) => ({ ...p, [key]: e.target.value }));
    },
  });

  const submit = async () => {
    if (!form.check(f.name.trim() ? {} : { name: t("invalid.required") })) return;
    setBusy(true);
    const ok = contact ? await act(() => orgApi.patch(`/contacts/${contact.id}`, f), t("common.saved"), form) : await act(() => orgApi.post("/contacts", f), t("common.saved"), form);
    setBusy(false);
    if (ok) onClose();
  };

  const remove = async () => {
    if (!contact || !(await confirm({ title: t("contacts.deleteTitle"), message: contact.name, confirmLabel: t("common.delete"), danger: true }))) return;
    if (await act(() => orgApi.del(`/contacts/${contact.id}`))) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      onSubmit={submit}
      size="lg"
      title={contact ? t("contacts.edit") : t("contacts.new")}
      footer={
        <>
          {contact && (
            <Button variant="danger" icon={<Trash2 size={18} aria-hidden />} onClick={remove} className="mr-auto">
              {t("common.delete")}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="primary" busy={busy}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("contacts.name")} error={form.of("name")}>
          <Input {...bind("name")} maxLength={120} autoComplete="off" />
        </Field>
        <Field label={t("contacts.company")} error={form.of("company")}>
          <Input {...bind("company")} maxLength={120} autoComplete="off" />
        </Field>
        <Field label={t("contacts.category")} className="sm:col-span-2" error={form.of("category")}>
          <Select {...bind("category")}>
            {contactCategories.map((c) => (
              <option key={c} value={c}>
                {t(`contactCat.${c}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("contacts.phone")} error={form.of("phone")}>
          <Input type="tel" {...bind("phone")} maxLength={40} inputMode="tel" autoComplete="off" />
        </Field>
        <Field label={t("contacts.phone2")} error={form.of("phone2")}>
          <Input type="tel" {...bind("phone2")} maxLength={40} inputMode="tel" autoComplete="off" />
        </Field>
        <Field label={t("contacts.email")} error={form.of("email")}>
          <Input {...bind("email")} maxLength={200} inputMode="email" autoComplete="off" autoCapitalize="none" />
        </Field>
        <Field label={t("contacts.website")} error={form.of("website")}>
          <Input {...bind("website")} maxLength={300} inputMode="url" autoComplete="off" />
        </Field>
        <Field label={t("contacts.address")} hint={t("contacts.addressHint")} className="sm:col-span-2" error={form.of("address")}>
          <Input {...bind("address")} maxLength={300} autoComplete="off" />
        </Field>
        <Field label={t("contacts.notes")} className="sm:col-span-2" error={form.of("notes")} action={<DictateButton onText={(text) => setF((p) => ({ ...p, notes: appendText(p.notes, text) }))} />}>
          <Textarea {...bind("notes")} rows={3} />
        </Field>
      </div>
    </Modal>
  );
}
