import { migrate, dbKind } from "./client.js";

await migrate();
console.log(`Migrations applied (${dbKind})`);
process.exit(0);
