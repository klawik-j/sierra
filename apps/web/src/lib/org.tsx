import { useQuery } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { can as canRole, type Actor, type BootstrapDto, type Capability, type CategoryDto, type MeDto, type MemberDto, type MembershipDto, type OrgDto, type Role, type UserDto } from "@sierra/shared";
import { api } from "./api";

const ORG_KEY = "sierra.org";

export const useMe = () => useQuery({ queryKey: ["me"], queryFn: () => api<MeDto>("/api/me"), retry: false, staleTime: 60_000 });

export interface OrgState {
  orgId: string;
  org: OrgDto;
  role: Role;
  user: UserDto;
  memberships: MembershipDto[];
  /** Everyone who ever belonged to the farm (history still needs their names). */
  members: MemberDto[];
  activeMembers: MemberDto[];
  categories: CategoryDto[];
  actor: Actor;
  can: (capability: Capability) => boolean;
  member: (id: string | null | undefined) => MemberDto | undefined;
  category: (id: string | null | undefined) => CategoryDto | undefined;
  switchOrg: (orgId: string) => void;
}

const Ctx = createContext<OrgState | null>(null);

export function useOrg(): OrgState {
  const value = useContext(Ctx);
  if (!value) throw new Error("useOrg outside OrgProvider");
  return value;
}

export function OrgProvider({ me, fallback, empty, children }: { me: MeDto; fallback: (state: { error: boolean; retry: () => void }) => ReactNode; empty: ReactNode; children: ReactNode }) {
  const [stored, setStored] = useState(() => localStorage.getItem(ORG_KEY));
  const orgId = me.memberships.find((m) => m.orgId === stored)?.orgId ?? me.memberships[0]?.orgId;
  const boot = useQuery({
    queryKey: ["org", orgId, "bootstrap"],
    queryFn: () => api<BootstrapDto>(`/api/o/${orgId}/bootstrap`),
    enabled: !!orgId,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (orgId) localStorage.setItem(ORG_KEY, orgId);
  }, [orgId]);

  const switchOrg = useCallback((id: string) => {
    localStorage.setItem(ORG_KEY, id);
    setStored(id);
  }, []);

  const data = boot.data;
  const value = useMemo<OrgState | null>(() => {
    if (!orgId || !data) return null;
    const byId = new Map(data.members.map((m) => [m.userId, m]));
    const cats = new Map(data.categories.map((c) => [c.id, c]));
    return {
      orgId,
      org: data.org,
      role: data.role,
      user: me.user,
      memberships: me.memberships,
      members: data.members,
      activeMembers: data.members.filter((m) => m.active),
      categories: data.categories,
      actor: { userId: me.user.id, role: data.role, settings: data.org.settings },
      can: (capability) => canRole(data.role, capability, data.org.settings),
      member: (id) => (id ? byId.get(id) : undefined),
      category: (id) => (id ? cats.get(id) : undefined),
      switchOrg,
    };
  }, [orgId, data, me, switchOrg]);

  if (!orgId) return <>{empty}</>;
  if (!value) return <>{fallback({ error: boot.isError, retry: () => boot.refetch() })}</>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
