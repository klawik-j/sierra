import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { ZodError } from "zod";
import type { ValidationIssue } from "@sierra/shared";
import { dbKind } from "./db/client.js";
import { userFromRequest } from "./lib/auth.js";
import { loadOrgContext } from "./lib/context.js";
import { HttpError } from "./lib/errors.js";
import { storageDriver } from "./lib/storage.js";
import { assetRoutes } from "./routes/assets.js";
import { authRoutes } from "./routes/auth.js";
import { contactRoutes } from "./routes/contacts.js";
import { fileRoutes, MAX_UPLOAD_BYTES } from "./routes/files.js";
import { noteRoutes } from "./routes/notes.js";
import { orgRoutes } from "./routes/orgs.js";
import { ticketRoutes } from "./routes/tickets.js";
import { workTimeRoutes } from "./routes/worktime.js";

const PUBLIC_API = ["/api/auth/login", "/api/auth/register", "/api/auth/logout", "/api/auth/config", "/api/invitations/", "/api/health"];
const ORG_PATH = /^\/api\/o\/([^/]+)(\/|$)/;

export async function buildApp() {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL || "info" }, bodyLimit: 1024 * 1024, trustProxy: true });
  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
  await app.register(rateLimit, { global: false });

  app.addHook("preHandler", async (req) => {
    const url = req.url.split("?")[0];
    if (!url.startsWith("/api/")) return;
    // Cookie auth + a header browsers never add to cross-site form posts = CSRF protection.
    if (req.method !== "GET" && req.method !== "HEAD" && !req.headers["x-requested-with"]) {
      throw new HttpError(403, "csrf", "Missing X-Requested-With header");
    }
    if (PUBLIC_API.some((p) => url.startsWith(p))) return;
    const user = await userFromRequest(req);
    if (!user) throw new HttpError(401, "unauthorized", "Sign in required");
    req.user = user;
    const orgId = ORG_PATH.exec(url)?.[1];
    if (orgId) {
      const org = await loadOrgContext(user.id, orgId);
      // 404, not 403: do not reveal whether another tenant's id exists.
      if (!org) throw new HttpError(404, "not_found", "Organization not found");
      req.org = org;
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      // Field paths and limits go to the client so forms can point at the exact field.
      const issues = err.issues.map((i): ValidationIssue => {
        const extra = i as { origin?: unknown; format?: unknown; minimum?: unknown; maximum?: unknown };
        return {
          path: i.path.join("."),
          code: i.code,
          origin: typeof extra.origin === "string" ? extra.origin : undefined,
          format: typeof extra.format === "string" ? extra.format : undefined,
          minimum: typeof extra.minimum === "number" ? extra.minimum : undefined,
          maximum: typeof extra.maximum === "number" ? extra.maximum : undefined,
        };
      });
      return reply.code(400).send({ error: "validation", message: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), issues });
    }
    if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.code, message: err.message });
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status === 429) return reply.code(429).send({ error: "rate_limited", message: "Too many attempts, try again in a minute" });
    if (status === 413) return reply.code(413).send({ error: "too_large", message: "File is too large" });
    if (status >= 500) req.log.error(err);
    return reply.code(status).send({ error: status >= 500 ? "server_error" : "bad_request", message: status >= 500 ? "Server error" : (err as Error).message });
  });

  app.get("/api/health", async () => ({ ok: true, db: dbKind, storage: storageDriver }));
  await app.register(authRoutes);
  await app.register(orgRoutes);
  await app.register(assetRoutes);
  await app.register(contactRoutes);
  await app.register(ticketRoutes);
  await app.register(noteRoutes);
  await app.register(workTimeRoutes);
  await app.register(fileRoutes);

  // In production the API also serves the built web app (single deployable unit).
  const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, {
      root: webDist,
      setHeaders(res, filePath) {
        res.header("Cache-Control", filePath.includes(`${path.sep}assets${path.sep}`) ? "public, max-age=31536000, immutable" : "no-cache");
      },
    });
  }
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api/") || !existsSync(webDist)) return reply.code(404).send({ error: "not_found", message: "Not found" });
    reply.header("Cache-Control", "no-cache");
    return reply.sendFile("index.html");
  });
  return app;
}
