import { useState } from "react";
import { useNavigate } from "react-router";
import { assetStatuses, assetTypes, type AssetDto, type AssetKind, type AssetStatus } from "@sierra/shared";
import { appendText, Button, DictateButton, Field, Input, Modal, Select, Textarea } from "../components/ui";
import { useT } from "../lib/i18n";
import { useAct, useOrgApi } from "../lib/queries";
import { useFormErrors, type FieldErrors } from "../lib/validation";

const TOP_LEVEL = ["name", "type", "status", "notes"];
/** Form key -> field path as the API reports it. */
const pathOf = (key: string) => (TOP_LEVEL.includes(key) ? key : `details.${key}`);

export function AssetForm({ asset, kind, onClose }: { asset?: AssetDto; kind: AssetKind; onClose: () => void }) {
  const t = useT();
  const orgApi = useOrgApi();
  const act = useAct();
  const navigate = useNavigate();
  const machine = kind === "machine";
  const d = asset?.details;
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState(() => ({
    name: asset?.name ?? "",
    type: asset?.type ?? (assetTypes[kind][0] as string),
    status: (asset?.status ?? "operational") as AssetStatus,
    notes: asset?.notes ?? "",
    make: d?.make ?? "",
    model: d?.model ?? "",
    year: d?.year ? String(d.year) : "",
    plate: d?.plate ?? "",
    vin: d?.vin ?? "",
    inspectionDue: d?.inspectionDue ?? "",
    insuranceDue: d?.insuranceDue ?? "",
    serviceDue: d?.serviceDue ?? "",
    address: d?.address ?? "",
    areaM2: d?.areaM2 ? String(d.areaM2) : "",
  }));
  const form = useFormErrors({
    name: t("assets.name"),
    type: t("assets.type"),
    status: t("assets.status"),
    notes: t("assets.notes"),
    "details.make": t("assets.make"),
    "details.model": t("assets.model"),
    "details.year": t(machine ? "assets.year" : "assets.yearBuilt"),
    "details.plate": t("assets.plate"),
    "details.vin": t("assets.vin"),
    "details.inspectionDue": t("assets.inspectionDue"),
    "details.insuranceDue": t("assets.insuranceDue"),
    "details.serviceDue": t("assets.serviceDue"),
    "details.address": t("assets.address"),
    "details.areaM2": t("assets.area"),
  });
  const err = (key: keyof typeof f) => form.of(pathOf(key));
  const bind = (key: keyof typeof f) => ({
    value: f[key],
    onChange: (e: { target: { value: string } }) => {
      form.clear(pathOf(key));
      setF((p) => ({ ...p, [key]: e.target.value }));
    },
  });
  const num = (v: string) => (v.trim() ? Number(v.replace(",", ".")) : null);

  const submit = async () => {
    // Catch what can be caught before sending, and say exactly what is expected.
    const found: FieldErrors = {};
    if (!f.name.trim()) found.name = t("invalid.required");
    const year = num(f.year);
    if (year !== null && !(Number.isInteger(year) && year >= 1900 && year <= 2100)) found["details.year"] = t("invalid.year");
    const area = num(f.areaM2);
    if (!machine && area !== null && !(Number.isFinite(area) && area >= 0)) found["details.areaM2"] = t("invalid.number");
    if (!form.check(found)) return;
    const body = {
      kind,
      name: f.name,
      type: f.type,
      status: f.status,
      notes: f.notes,
      details: machine
        ? { make: f.make, model: f.model, year: num(f.year), plate: f.plate, vin: f.vin, inspectionDue: f.inspectionDue || null, insuranceDue: f.insuranceDue || null, serviceDue: f.serviceDue || null }
        : { address: f.address, areaM2: num(f.areaM2), year: num(f.year) },
    };
    setBusy(true);
    const result = asset ? await act(() => orgApi.patch(`/assets/${asset.id}`, body), t("common.saved"), form) : await act(() => orgApi.post("/assets", body), undefined, form);
    setBusy(false);
    if (!result) return;
    onClose();
    if (!asset) navigate(`/assets/${(result as { id: string }).id}`);
  };

  return (
    <Modal
      open
      onClose={onClose}
      onSubmit={submit}
      size="lg"
      title={asset ? t("assets.edit") : t(machine ? "assets.newMachine" : "assets.newBuilding")}
      footer={
        <>
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
        <Field label={t("assets.name")} className="sm:col-span-2" error={err("name")}>
          <Input {...bind("name")} placeholder={t(machine ? "assets.namePlaceholderMachine" : "assets.namePlaceholderBuilding")} maxLength={120} />
        </Field>
        <Field label={t("assets.type")}>
          <Select {...bind("type")}>
            {assetTypes[kind].map((type) => (
              <option key={type} value={type}>
                {t(`assetType.${type}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("assets.status")}>
          <Select {...bind("status")}>
            {assetStatuses.map((s) => (
              <option key={s} value={s}>
                {t(`assetStatus.${s}`)}
              </option>
            ))}
          </Select>
        </Field>
        {machine ? (
          <>
            <Field label={t("assets.make")} error={err("make")}>
              <Input {...bind("make")} maxLength={80} />
            </Field>
            <Field label={t("assets.model")} error={err("model")}>
              <Input {...bind("model")} maxLength={80} />
            </Field>
            <Field label={t("assets.year")} error={err("year")}>
              <Input {...bind("year")} inputMode="numeric" maxLength={4} />
            </Field>
            <Field label={t("assets.plate")} error={err("plate")}>
              <Input {...bind("plate")} maxLength={20} autoCapitalize="characters" />
            </Field>
            <Field label={t("assets.vin")} className="sm:col-span-2" error={err("vin")}>
              <Input {...bind("vin")} maxLength={40} autoCapitalize="characters" />
            </Field>
            <Field label={t("assets.inspectionDue")} error={err("inspectionDue")}>
              <Input type="date" {...bind("inspectionDue")} />
            </Field>
            <Field label={t("assets.insuranceDue")} error={err("insuranceDue")}>
              <Input type="date" {...bind("insuranceDue")} />
            </Field>
            <Field label={t("assets.serviceDue")} error={err("serviceDue")}>
              <Input type="date" {...bind("serviceDue")} />
            </Field>
          </>
        ) : (
          <>
            <Field label={t("assets.address")} hint={t("assets.addressHint")} className="sm:col-span-2" error={err("address")}>
              <Input {...bind("address")} maxLength={300} />
            </Field>
            <Field label={t("assets.area")} error={err("areaM2")}>
              <Input {...bind("areaM2")} inputMode="decimal" />
            </Field>
            <Field label={t("assets.yearBuilt")} error={err("year")}>
              <Input {...bind("year")} inputMode="numeric" maxLength={4} />
            </Field>
          </>
        )}
        <Field label={t("assets.notes")} className="sm:col-span-2" error={err("notes")} action={<DictateButton onText={(text) => setF((p) => ({ ...p, notes: appendText(p.notes, text) }))} />}>
          <Textarea {...bind("notes")} rows={3} />
        </Field>
      </div>
    </Modal>
  );
}
