import { useCallback, useState } from "react";
import type { ValidationIssue } from "@sierra/shared";
import { ApiError } from "./api";
import type { TFn, TKey } from "./i18n";

/** Field errors keyed by field path ("name", "details.year"). */
export type FieldErrors = Record<string, string>;

/** "labels.3" -> "labels": errors on list items are shown on the list's field. */
const fieldOf = (path: string) =>
  path
    .split(".")
    .filter((part) => !/^\d+$/.test(part))
    .join(".");

/** What is wrong with one field, in the user's language. */
export function issueText(t: TFn, issue: ValidationIssue): string {
  const n = issue.code === "too_small" ? issue.minimum : issue.maximum;
  if (issue.format === "email" || /(^|\.)email$/.test(issue.path)) return t("invalid.email");
  if (issue.code === "too_small" && issue.origin === "string") return n === 1 ? t("invalid.required") : t("invalid.minLength", { n: n ?? 0 });
  if (issue.code === "too_big" && issue.origin === "string") return t("invalid.maxLength", { n: n ?? 0 });
  if (issue.code === "too_small" && n !== undefined) return t("invalid.min", { n });
  if (issue.code === "too_big" && issue.origin === "array") return t("invalid.maxItems", { n: n ?? 0 });
  if (issue.code === "too_big" && n !== undefined) return t("invalid.max", { n });
  if (issue.code === "invalid_format") return t("invalid.format");
  return t("invalid.value");
}

// Labels for fields of forms that do not show errors inline (sign-in, settings, small dialogs).
const fallbackLabels: Record<string, TKey> = {
  email: "auth.email",
  password: "auth.password",
  current: "settings.currentPassword",
  next: "settings.newPassword",
  name: "field.name",
  orgName: "auth.farmName",
  phone: "contacts.phone",
  ticketPrefix: "settings.ticketPrefix",
  address: "contacts.address",
  title: "ticket.title",
  body: "notes.body",
  text: "ticket.checklist",
  minutes: "ticket.hours",
  date: "ticket.date",
  value: "assets.readingValue",
  recordedAt: "ticket.date",
  color: "settings.color",
  role: "team.role",
};

export function issuesOf(err: unknown): ValidationIssue[] {
  return err instanceof ApiError && err.code === "validation" ? err.issues : [];
}

export function toFieldErrors(t: TFn, issues: ValidationIssue[]): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of issues) out[fieldOf(issue.path)] ??= issueText(t, issue);
  return out;
}

/** One line naming every rejected field: "Rok produkcji: …; VIN: …". Null when no field could be named. */
export function describeIssues(t: TFn, issues: ValidationIssue[], labels?: Record<string, string>): string | null {
  const parts: string[] = [];
  for (const [path, text] of Object.entries(toFieldErrors(t, issues))) {
    const key = fallbackLabels[path.split(".").pop() ?? ""];
    const label = labels?.[path] ?? (key ? t(key) : null);
    if (label) parts.push(`${label}: ${text}`);
  }
  return parts.length ? parts.join(" ") : null;
}

function focusFirstInvalid() {
  // After React has rendered the messages: move to the first marked field (also scrolls it into view).
  setTimeout(() => document.querySelector<HTMLElement>("[data-invalid] input, [data-invalid] select, [data-invalid] textarea")?.focus(), 0);
}

export interface FormErrors {
  /** Error text for a field, if any — pass to `<Field error>`. */
  of: (path: string) => string | undefined;
  /** Call when the user edits a field. */
  clear: (path: string) => void;
  /** Show errors found before sending; returns true when there are none. */
  check: (errors: FieldErrors) => boolean;
  /** Show errors reported by the server. */
  fromServer: (t: TFn, issues: ValidationIssue[]) => void;
  /** Field path -> visible label, used for the summary message. */
  labels: Record<string, string>;
}

/** Per-form field errors: shown under the field, cleared as the user fixes it. */
export function useFormErrors(labels: Record<string, string>): FormErrors {
  const [errors, setErrors] = useState<FieldErrors>({});
  const show = useCallback((next: FieldErrors) => {
    setErrors(next);
    if (Object.keys(next).length) focusFirstInvalid();
  }, []);
  const clear = useCallback((path: string) => setErrors((prev) => (path in prev ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== path)) : prev)), []);
  return {
    of: (path) => errors[path],
    clear,
    check(next) {
      show(next);
      return Object.keys(next).length === 0;
    },
    fromServer: (t, issues) => show(toFieldErrors(t, issues)),
    labels,
  };
}
