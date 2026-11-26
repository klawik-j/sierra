import type { assetTypes } from "@sierra/shared";
import { createLucideIcon, type LucideIcon } from "lucide-react";

/*
 * Sierra asset icons: one family per asset kind, drawn on Lucide's grid (24×24, 2px stroke,
 * round caps and joins, no fill) so they sit next to the Lucide UI icons. Rules: docs/ICONS.md.
 *   Machines  — side view facing right, wheels stand on y=20; towed implements end in a hitch at (22, 15).
 *   Buildings — front view standing on y=20; farm buildings share one roof + walls and differ by the emblem in the doorway.
 */

type Node = [tag: "path" | "circle" | "rect" | "ellipse", attrs: Record<string, string>];
type MachineType = (typeof assetTypes)["machine"][number];
type BuildingType = (typeof assetTypes)["building"][number];

const wheel = (cx: number, r: 2 | 3 | 4): Node => ["circle", { cx: `${cx}`, cy: `${20 - r}`, r: `${r}` }];
const hitch = (fromX: number): Node => ["path", { d: `M${fromX} 15H22` }];
const roof: Node = ["path", { d: "M2 10 12 4l10 6" }];
const walls: Node = ["path", { d: "M4 9v11h16V9" }];

export const machineIconNodes: Record<MachineType, Node[]> = {
  tractor: [
    wheel(7, 4),
    wheel(18, 2),
    ["path", { d: "M4 12V5a1 1 0 0 1 1-1h4.2a1 1 0 0 1 1 .8L11.4 10" }],
    ["path", { d: "M11.4 10H19a1 1 0 0 1 1 1v3h-9.5" }],
    ["path", { d: "M17 10V6.5" }],
  ],
  combine: [
    wheel(4, 2),
    wheel(12, 3),
    ["path", { d: "M2 14V8a1 1 0 0 1 1-1h7V4a1 1 0 0 1 1-1h2.5l1.5 4v7z" }],
    ["path", { d: "M5 7 3 3.5" }],
    ["path", { d: "m15 12 3 5h4" }],
    ["circle", { cx: "19.5", cy: "10.5", r: "2" }],
  ],
  car: [
    wheel(7, 2),
    wheel(17, 2),
    ["path", { d: "M5 18H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h1.5l2.7-3.6A1 1 0 0 1 9 8h5.5a1 1 0 0 1 .8.4L18 12h1.5a1.5 1.5 0 0 1 1.5 1.5V17a1 1 0 0 1-1 1h-1" }],
    ["path", { d: "M9 18h6" }],
  ],
  truck: [
    wheel(6, 2),
    wheel(17, 2),
    ["path", { d: "M4 18H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v13" }],
    ["path", { d: "M8 18h7" }],
    ["path", { d: "M14 9h4l3 4v4a1 1 0 0 1-1 1h-1" }],
  ],
  trailer: [wheel(7, 2), wheel(12, 2), ["path", { d: "M3 8h14l-1 7H4z" }], hitch(16)],
  sprayer: [
    wheel(12, 2),
    ["rect", { x: "6", y: "7", width: "12", height: "8", rx: "4" }],
    ["path", { d: "M2 15h20" }],
    ["path", { d: "m4 18-1 2M7 18l-1 2" }],
  ],
  seeder: [
    ["path", { d: "M5 6h12l-2 6H7z" }],
    ["path", { d: "M3 15h19" }],
    ["path", { d: "m7 15-1 5M11 15l-1 5M15 15l-1 5" }],
  ],
  plough: [
    ["path", { d: "M2 8h20v7" }],
    ["path", { d: "M6 8v8a4 4 0 0 1-4 4" }],
    ["path", { d: "M12 8v8a4 4 0 0 1-4 4" }],
    ["path", { d: "M18 8v8a4 4 0 0 1-4 4" }],
  ],
  loader: [
    wheel(5, 3),
    wheel(14, 3),
    ["path", { d: "M2 14V5a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 .8L8.5 9H11a1 1 0 0 1 1 1v4z" }],
    ["path", { d: "m9 9 9 4" }],
    ["path", { d: "M18 12h3l1 5h-4z" }],
  ],
  baler: [
    wheel(9, 2),
    ["path", { d: "M3 15V8a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v7z" }],
    ["circle", { cx: "9", cy: "9.5", r: "2.5" }],
    hitch(15),
  ],
  mower: [
    ["path", { d: "M3 15v-3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v3" }],
    ["path", { d: "M2 15h20" }],
    ["path", { d: "m3 20 2-2 2 2 2-2 2 2 2-2 2 2" }],
  ],
  other: [
    wheel(7, 2),
    wheel(17, 2),
    ["rect", { x: "3", y: "6", width: "18", height: "10", rx: "1" }],
    ["path", { d: "M8 11h.01M12 11h.01M16 11h.01" }],
  ],
};

export const buildingIconNodes: Record<BuildingType, Node[]> = {
  barn: [
    ["path", { d: "M3 20V11l3-5 6-3 6 3 3 5v9z" }],
    ["path", { d: "M8 20v-7h8v7" }],
    ["path", { d: "m8 13 8 7M16 13l-8 7" }],
  ],
  cowshed: [roof, walls, ["path", { d: "M8 12a4 4 0 0 0 8 0" }], ["circle", { cx: "12", cy: "17", r: "2" }]],
  pigsty: [roof, walls, ["ellipse", { cx: "12", cy: "16", rx: "4", ry: "3" }], ["path", { d: "M10.5 16h.01M13.5 16h.01" }]],
  henhouse: [roof, walls, ["path", { d: "M12 12c-1.8 0-3 2.6-3 4.5a3 3 0 0 0 6 0c0-1.9-1.2-4.5-3-4.5z" }]],
  warehouse: [roof, walls, ["path", { d: "M8 20v-4h8v4M12 16v4M10 16v-4h4v4" }]],
  garage: [roof, walls, ["path", { d: "M7 20v-8h10v8M7 15h10M7 18h10" }]],
  workshop: [roof, walls, ["path", { d: "M15 10.5a2.5 2.5 0 1 0 2.5 2.5M13.2 14.8 9 19" }]],
  silo: [
    ["path", { d: "M7 20V8a5 5 0 0 1 10 0v12z" }],
    ["path", { d: "M7 11h10M7 15h10" }],
  ],
  house: [
    ["path", { d: "M3 11.5 12 4l9 7.5" }],
    ["path", { d: "M5 10v10h14V10" }],
    ["path", { d: "M16 7V4h2v4.5" }],
    ["path", { d: "M10 20v-5h4v5" }],
  ],
  greenhouse: [
    ["path", { d: "M3 20v-8a9 9 0 0 1 18 0v8z" }],
    ["path", { d: "M9 20V3.6M15 20V3.6M3 13h18" }],
  ],
  other: [roof, walls, ["path", { d: "M8 16h.01M12 16h.01M16 16h.01" }]],
};

const toIcons = <T extends string>(prefix: string, nodes: Record<T, Node[]>) =>
  Object.fromEntries(
    Object.entries<Node[]>(nodes).map(([type, node]) => [type, createLucideIcon(`${prefix}-${type}`, node.map(([tag, attrs], i) => [tag, { ...attrs, key: `${i}` }]))]),
  ) as Record<T, LucideIcon>;

export const machineIcons = toIcons("machine", machineIconNodes);
export const buildingIcons = toIcons("building", buildingIconNodes);

/** Section icons (navigation, quick add, tabs, empty states). */
export const MachinesIcon = machineIcons.tractor;
export const BuildingsIcon = buildingIcons.barn;
