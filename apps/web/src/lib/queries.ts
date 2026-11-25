import { useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import type { ActivityDto, AssetDetailDto, AssetDto, ContactDto, FileDto, InvitationDto, NoteDto, NotificationDto, TicketDetailDto, TicketDto, WorkTimeDto } from "@sierra/shared";
import { api, ApiError, fileUrl } from "./api";
import { useT, type TFn, type TKey } from "./i18n";
import { useOrg } from "./org";
import { useToast } from "./toast";
import { describeIssues, issuesOf, type FormErrors } from "./validation";

/** All server data of a farm lives under ["org", orgId, ...], so switching farms never mixes caches. */
export function useOrgQuery<T>(key: readonly unknown[], path: string, options?: Partial<UseQueryOptions<T>>) {
  const { orgId } = useOrg();
  return useQuery<T>({ queryKey: ["org", orgId, ...key], queryFn: () => api<T>(`/api/o/${orgId}${path}`), ...options });
}

export const useTickets = () => useOrgQuery<TicketDto[]>(["tickets"], "/tickets");
export const useTicket = (id: string | undefined) => useOrgQuery<TicketDetailDto>(["tickets", id], `/tickets/${id}`, { enabled: !!id, retry: false });
export const useAssets = () => useOrgQuery<AssetDto[]>(["assets"], "/assets");
export const useAsset = (id: string | undefined) => useOrgQuery<AssetDetailDto>(["assets", id], `/assets/${id}`, { enabled: !!id, retry: false });
export const useContacts = () => useOrgQuery<ContactDto[]>(["contacts"], "/contacts");
export const useNotes = () => useOrgQuery<NoteDto[]>(["notes"], "/notes");
export const useNotifications = () => useOrgQuery<NotificationDto[]>(["notifications"], "/notifications", { refetchInterval: 60_000 });
export const useActivity = (limit = 20) => useOrgQuery<ActivityDto[]>(["activity", limit], `/activity?limit=${limit}`);
/** Daily totals and per-ticket time for a date range; `userId` narrows it to one person (managers only — others always get their own). */
export const useWorkTime = (from: string, to: string, userId?: string) =>
  useOrgQuery<WorkTimeDto>(["worktime", from, to, userId ?? "all"], `/worktime?from=${from}&to=${to}${userId ? `&userId=${userId}` : ""}`);
export const useInvitations = (enabled: boolean) => useOrgQuery<InvitationDto[]>(["invitations"], "/invitations", { enabled });

export function useOrgApi() {
  const { orgId } = useOrg();
  return useMemo(() => {
    const base = `/api/o/${orgId}`;
    return {
      get: <T>(path: string) => api<T>(base + path),
      post: <T = { id: string }>(path: string, json: unknown = {}) => api<T>(base + path, { method: "POST", json }),
      patch: (path: string, json: unknown) => api(base + path, { method: "PATCH", json }),
      put: (path: string, json: unknown = {}) => api(base + path, { method: "PUT", json }),
      del: (path: string) => api(base + path, { method: "DELETE" }),
      upload(file: File, fields: { ownerType: FileDto["ownerType"]; ownerId: string; tag?: FileDto["tag"] }) {
        const form = new FormData();
        // Fields first: the server reads them while streaming the file part.
        for (const [k, v] of Object.entries(fields)) if (v) form.append(k, v);
        form.append("file", file);
        return api<FileDto>(`${base}/files`, { method: "POST", body: form });
      },
      fileUrl: (id: string, variant?: Parameters<typeof fileUrl>[2]) => fileUrl(orgId, id, variant),
    };
  }, [orgId]);
}

export function errorText(t: TFn, err: unknown, labels?: Record<string, string>) {
  if (err instanceof ApiError) {
    // Say which fields were rejected and why, not just "check your data".
    const detail = describeIssues(t, issuesOf(err), labels);
    if (detail) return detail;
    const key = `err.${err.code}` as TKey;
    const text = t(key);
    return text === key ? err.message : text;
  }
  return t("err.server_error");
}

/**
 * Runs a mutation, refreshes the farm's cached data and reports failures as a toast.
 * Pass the form's `FormErrors` to also mark the rejected fields. Resolves to the result, or undefined when it failed.
 */
export function useAct() {
  const { orgId } = useOrg();
  const qc = useQueryClient();
  const toast = useToast();
  const t = useT();
  return useCallback(
    async <T,>(fn: () => Promise<T>, okMessage?: string, form?: FormErrors): Promise<T | undefined> => {
      try {
        const result = await fn();
        await qc.invalidateQueries({ queryKey: ["org", orgId] });
        if (okMessage) toast.push(okMessage);
        return result;
      } catch (err) {
        if (form) form.fromServer(t, issuesOf(err));
        toast.push(errorText(t, err, form?.labels), "error");
        await qc.invalidateQueries({ queryKey: ["org", orgId] });
        return undefined;
      }
    },
    [orgId, qc, toast, t],
  );
}
