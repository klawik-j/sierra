import { ClipboardList, Gauge, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { assetStatuses, isOpenStatus, type AssetDto, type AssetKind, type AssetStatus } from "@sierra/shared";
import { BuildingsIcon, MachinesIcon } from "../components/assetIcons";
import { assetDeadlines, assetIcon, AssetStatusBadge } from "../components/domain";
import { Badge, Button, Chip, EmptyState, Input, PageHeader, PageLoader, Segmented } from "../components/ui";
import { useForms } from "../features/forms";
import { useFmt } from "../lib/format";
import { label, useT } from "../lib/i18n";
import { useOrg } from "../lib/org";
import { useAssets, useOrgApi, useTickets } from "../lib/queries";

export function AssetsPage({ kind }: { kind: AssetKind }) {
  const t = useT();
  const { can } = useOrg();
  const forms = useForms();
  const navigate = useNavigate();
  const assets = useAssets();
  const tickets = useTickets();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<AssetStatus | "">("");
  const machine = kind === "machine";

  const openCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const x of tickets.data ?? []) if (isOpenStatus(x.status)) for (const id of x.assetIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    return counts;
  }, [tickets.data]);

  const all = (assets.data ?? []).filter((a) => a.kind === kind);
  const needle = q.trim().toLowerCase();
  const shown = all.filter((a) => (!status || a.status === status) && (!needle || `${a.name} ${a.details.make ?? ""} ${a.details.model ?? ""} ${a.details.plate ?? ""} ${label(t, "assetType", a.type)}`.toLowerCase().includes(needle)));
  const usedStatuses = assetStatuses.filter((s) => all.some((a) => a.status === s));
  const add = () => forms.open({ kind: "asset", assetKind: kind });

  return (
    <>
      <PageHeader
        title={t(machine ? "nav.machines" : "nav.buildings")}
        subtitle={assets.data ? t(machine ? "assets.countMachines" : "assets.countBuildings", { n: all.length }) : undefined}
        actions={
          can("assets.manage") && (
            <Button variant="primary" icon={<Plus size={19} strokeWidth={2.5} aria-hidden />} onClick={add}>
              {t(machine ? "assets.newMachine" : "assets.newBuilding")}
            </Button>
          )
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-2.5">
        <Segmented
          label={t("nav.assets")}
          value={kind}
          onChange={(v) => navigate(v === "machine" ? "/machines" : "/buildings")}
          options={[
            { value: "machine", label: <><MachinesIcon size={17} aria-hidden />{t("nav.machines")}</> },
            { value: "building", label: <><BuildingsIcon size={17} aria-hidden />{t("nav.buildings")}</> },
          ]}
          className="flex lg:hidden"
        />
        {all.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("common.search")} aria-label={t("common.search")} className="pl-10" />
            </div>
            {usedStatuses.length > 1 && (
              <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
                <Chip active={!status} onClick={() => setStatus("")}>
                  {t("common.all")}
                </Chip>
                {usedStatuses.map((s) => (
                  <Chip key={s} active={status === s} onClick={() => setStatus(status === s ? "" : s)}>
                    {t(`assetStatus.${s}`)}
                  </Chip>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {assets.isPending ? (
        <PageLoader />
      ) : shown.length ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {shown.map((a) => (
            <li key={a.id}>
              <AssetCard asset={a} open={openCount.get(a.id) ?? 0} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={machine ? <MachinesIcon size={24} aria-hidden /> : <BuildingsIcon size={24} aria-hidden />}
          title={all.length ? t("common.nothingFound") : t(machine ? "assets.emptyMachines" : "assets.emptyBuildings")}
          text={all.length ? undefined : t(machine ? "assets.emptyMachinesText" : "assets.emptyBuildingsText")}
          action={
            !all.length && can("assets.manage") ? (
              <Button variant="primary" icon={<Plus size={18} aria-hidden />} onClick={add}>
                {t(machine ? "assets.newMachine" : "assets.newBuilding")}
              </Button>
            ) : undefined
          }
        />
      )}
    </>
  );
}

function AssetCard({ asset, open }: { asset: AssetDto; open: number }) {
  const t = useT();
  const fmt = useFmt();
  const orgApi = useOrgApi();
  const Icon = assetIcon(asset);
  const d = asset.details;
  const deadlines = asset.kind === "machine" ? assetDeadlines(asset).filter((x) => x.state !== "later") : [];
  const sub = asset.kind === "machine" ? [label(t, "assetType", asset.type), d.plate].filter(Boolean).join(" · ") : [label(t, "assetType", asset.type), d.areaM2 ? `${fmt.number(d.areaM2)} m²` : null].filter(Boolean).join(" · ");
  return (
    <Link to={`/assets/${asset.id}`} className="group flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface shadow-raise transition-[border-color,box-shadow] duration-150 hover:border-primary hover:shadow-pop">
      <div className="relative aspect-[16/9] overflow-hidden bg-surface-2">
        {asset.coverFileId ? (
          <img src={orgApi.fileUrl(asset.coverFileId, "thumb")} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <div className="flex size-full items-center justify-center bg-gradient-to-br from-primary-soft to-surface-2 text-primary-ink/50">
            <Icon size={56} strokeWidth={1.25} aria-hidden />
          </div>
        )}
        <span className="absolute left-2.5 top-2.5">
          <AssetStatusBadge status={asset.status} />
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div className="min-w-0">
          <p className="truncate text-base font-bold">{asset.name}</p>
          <p className="truncate text-sm text-muted">{sub}</p>
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-1.5">
          {asset.hours !== null && (
            <Badge tone="muted" icon={<Gauge size={12} aria-hidden />}>
              {fmt.number(asset.hours)} {t("assets.unit.hours")}
            </Badge>
          )}
          {asset.km !== null && (
            <Badge tone="muted" icon={<Gauge size={12} aria-hidden />}>
              {fmt.number(asset.km)} km
            </Badge>
          )}
          {open > 0 && (
            <Badge tone="info" icon={<ClipboardList size={12} aria-hidden />}>
              {t("assets.openTickets", { n: open })}
            </Badge>
          )}
          {deadlines.map((x) => (
            <Badge key={x.kind} tone={x.state === "overdue" ? "danger" : "warn"}>
              {t(`assets.deadline.${x.kind}`)}: {fmt.due(x.day)}
            </Badge>
          ))}
        </div>
      </div>
    </Link>
  );
}
