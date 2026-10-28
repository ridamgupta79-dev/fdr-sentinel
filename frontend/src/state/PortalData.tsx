import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from "react";
import { api } from "../api/endpoints";
import type { AuditLog, FDR, Institution, PortalUser, ReleaseRequest, User, Verification } from "../types";

type PortalDataValue = {
  user: User;
  isAdmin: boolean;
  fdrs: FDR[];
  institutions: Institution[];
  requests: ReleaseRequest[];
  verifications: Verification[];
  auditLogs: AuditLog[];
  users: PortalUser[];
  loading: boolean;
  error: string;
  partialError: boolean;
  institutionById: Map<number, Institution>;
  fdrById: Map<number, FDR>;
  refreshFdrs: () => Promise<void>;
  refreshInstitutions: () => Promise<void>;
  refreshReleases: () => Promise<void>;
  refreshVerifications: () => Promise<void>;
  refreshAdminData: () => Promise<void>;
  refreshAll: () => Promise<void>;
};

const PortalDataContext = createContext<PortalDataValue | null>(null);

export function PortalDataProvider({ user, children }: { user: User; children: ReactNode }) {
  const [fdrs, setFdrs] = useState<FDR[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [requests, setRequests] = useState<ReleaseRequest[]>([]);
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [partialError, setPartialError] = useState(false);
  const nonce = useRef(0);

  const isAdmin = (user.role || "").toLowerCase() === "admin";

  const loadCore = useCallback(async (silent = false) => {
    const run = ++nonce.current;
    if (!silent) setLoading(true);
    setError("");
    setPartialError(false);

    const tasks = [
      api.listFdrs(),
      api.listInstitutions(),
      api.listReleaseRequests(),
      api.listVerifications(),
    ] as const;

    const results = await Promise.allSettled(tasks);
    if (run !== nonce.current) return;

    const failures = results.filter(result => result.status === "rejected").length;
    if (results[0].status === "fulfilled") setFdrs(results[0].value);
    if (results[1].status === "fulfilled") setInstitutions(results[1].value);
    if (results[2].status === "fulfilled") setRequests(results[2].value);
    if (results[3].status === "fulfilled") setVerifications(results[3].value);

    if (failures === tasks.length) {
      setError("We couldn't load portal data. Check that the backend is running and your account permissions.");
    } else if (failures > 0) {
      setPartialError(true);
    }
    setLoading(false);
  }, []);

  const loadAdminData = useCallback(async () => {
    if (!isAdmin) return;
    const [audit, directory] = await Promise.allSettled([
      api.listAuditLogs(100, 0),
      api.listUsers(),
    ]);
    if (audit.status === "fulfilled") setAuditLogs(audit.value);
    if (directory.status === "fulfilled") setUsers(directory.value);
  }, [isAdmin]);

  useEffect(() => {
    loadCore();
  }, [loadCore]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  const refreshFdrs = useCallback(async () => {
    try {
      setFdrs(await api.listFdrs());
    } catch {
      setPartialError(true);
    }
  }, []);

  const refreshInstitutions = useCallback(async () => {
    try {
      setInstitutions(await api.listInstitutions());
    } catch {
      setPartialError(true);
    }
  }, []);

  const refreshReleases = useCallback(async () => {
    try {
      setRequests(await api.listReleaseRequests());
    } catch {
      setPartialError(true);
    }
  }, []);

  const refreshVerifications = useCallback(async () => {
    try {
      setVerifications(await api.listVerifications());
    } catch {
      setPartialError(true);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadCore(true), loadAdminData()]);
  }, [loadCore, loadAdminData]);

  const value = useMemo<PortalDataValue>(() => ({
    user,
    isAdmin,
    fdrs,
    institutions,
    requests,
    verifications,
    auditLogs,
    users,
    loading,
    error,
    partialError,
    institutionById: new Map(institutions.map(item => [item.id, item])),
    fdrById: new Map(fdrs.map(item => [item.id, item])),
    refreshFdrs,
    refreshInstitutions,
    refreshReleases,
    refreshVerifications,
    refreshAdminData: loadAdminData,
    refreshAll,
  }), [user, isAdmin, fdrs, institutions, requests, verifications, auditLogs, users, loading, error, partialError, refreshFdrs, refreshInstitutions, refreshReleases, refreshVerifications, loadAdminData, refreshAll]);

  return <PortalDataContext.Provider value={value}>{children}</PortalDataContext.Provider>;
}

export function usePortal(): PortalDataValue {
  const context = useContext(PortalDataContext);
  if (!context) throw new Error("usePortal must be used inside PortalDataProvider");
  return context;
}

export function useInstitutionName(): (institutionId: number | null | undefined) => string {
  const { institutionById } = usePortal();
  return useCallback((institutionId) => {
    if (!institutionId) return "—";
    return institutionById.get(institutionId)?.name || `Institution #${institutionId}`;
  }, [institutionById]);
}
