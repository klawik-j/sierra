import { buildApp } from "./app.js";
import { dbKind, migrate } from "./db/client.js";
import { storageDriver } from "./lib/storage.js";

await migrate();
const app = await buildApp();
const port = Number(process.env.PORT || 3002);
await app.listen({ port, host: process.env.HOST || "0.0.0.0" });
app.log.info(`Sierra API on :${port} (db: ${dbKind}, storage: ${storageDriver})`);
