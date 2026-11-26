// Draws docs/asset-icons.svg, the specimen sheet of the custom asset icons.
//   npx tsx scripts/icon-sheet.ts
import { writeFileSync } from "node:fs";
import { buildingIconNodes, machineIconNodes } from "../apps/web/src/components/assetIcons";

const CELL = 96;
const ICON = 48;
const attrs = (a: Record<string, string>) => Object.entries(a).map(([k, v]) => `${k}="${v}"`).join(" ");

const rows = [
  ["Machines", machineIconNodes],
  ["Buildings", buildingIconNodes],
] as const;
const cols = Math.max(...rows.map(([, set]) => Object.keys(set).length));
const width = cols * CELL + 32;
const height = rows.length * (CELL + 56) + 16;

const body = rows
  .map(([title, set], r) => {
    const top = 16 + r * (CELL + 56);
    const cells = Object.entries(set).map(([type, nodes], c) => {
      const x = 16 + c * CELL;
      const icon = nodes.map(([tag, a]) => `<${tag} ${attrs(a)}/>`).join("");
      return (
        `<g transform="translate(${x + (CELL - ICON) / 2} ${top + 36}) scale(${ICON / 24})">${icon}</g>` +
        `<text x="${x + CELL / 2}" y="${top + 36 + ICON + 22}" text-anchor="middle" class="l">${type}</text>`
      );
    });
    return `<text x="16" y="${top + 16}" class="h">${title}</text>${cells.join("")}`;
  })
  .join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<style>.h{font:700 16px sans-serif;fill:#1c2420}.l{font:13px sans-serif;fill:#5b655e}g{fill:none;stroke:#24552f;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}</style>
<rect width="100%" height="100%" rx="16" fill="#f4f2ec"/>${body}
</svg>
`;
writeFileSync(new URL("../docs/asset-icons.svg", import.meta.url), svg);
console.log("docs/asset-icons.svg");
