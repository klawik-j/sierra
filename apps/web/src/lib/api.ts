import type { ValidationIssue } from "@sierra/shared";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    /** Rejected fields when `code` is "validation". */
    public issues: ValidationIssue[] = [],
  ) {
    super(message);
  }
}

type Init = { method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; json?: unknown; body?: BodyInit };

export async function api<T = unknown>(path: string, init: Init = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? "GET",
      credentials: "same-origin",
      // Required by the API on every mutating request (CSRF protection).
      headers: { "x-requested-with": "sierra", ...(init.json !== undefined ? { "content-type": "application/json" } : {}) },
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    });
  } catch {
    throw new ApiError(0, "offline", "No connection");
  }
  if (!res.ok) {
    let code = "server_error";
    let message = res.statusText;
    let issues: ValidationIssue[] = [];
    try {
      const body = await res.json();
      code = body.error ?? code;
      message = body.message ?? message;
      if (Array.isArray(body.issues)) issues = body.issues;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, code, message, issues);
  }
  return res.json() as Promise<T>;
}

export const fileUrl = (orgId: string, id: string, variant: "thumb" | "preview" | "original" | "download" = "preview") => `/api/o/${orgId}/files/${id}/${variant}`;
