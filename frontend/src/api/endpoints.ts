import { apiArray, apiRequest, buildQuery } from "./client";
import type {
  AuditLog, FDR, FdrPayload, Institution, LoginResponse, PortalUser, ReleaseRequest, User, Verification,
} from "../types";

export type VerificationPayload = {
  method: string;
  result: string;
  reference_number: string | null;
  remarks: string | null;
  checked_by: string | null;
};

export type InstitutionPayload = {
  name: string;
  institution_code: string;
  email: string;
  phone: string | null;
  address: string | null;
};

export type InstitutionUpdatePayload = {
  name?: string;
  email?: string;
  phone?: string | null;
  address?: string | null;
  is_active?: boolean;
};

export type UserCreatePayload = {
  full_name: string;
  email: string;
  password: string;
  role: string;
  institution_id: number | null;
};

export const api = {
  login: (email: string, password: string) =>
    apiRequest<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    }),

  me: () => apiRequest<User>("/api/auth/me"),

  listFdrs: () => apiArray<FDR>("/api/fdrs"),

  createFdr: (payload: FdrPayload) =>
    apiRequest<FDR>("/api/fdrs", { method: "POST", body: JSON.stringify(payload) }),

  listInstitutions: () => apiArray<Institution>("/api/institutions"),

  createInstitution: (payload: InstitutionPayload) =>
    apiRequest<Institution>("/api/institutions", { method: "POST", body: JSON.stringify(payload) }),

  updateInstitution: (id: number, payload: InstitutionUpdatePayload) =>
    apiRequest<Institution>(`/api/institutions/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),

  listVerifications: (limit = 600) => apiArray<Verification>(`/api/verifications${buildQuery({ limit })}`),

  listFdrVerifications: (fdrId: number) => apiArray<Verification>(`/api/fdrs/${fdrId}/verifications`),

  createVerification: (fdrId: number, payload: VerificationPayload) =>
    apiRequest<Verification>(`/api/fdrs/${fdrId}/verifications`, {
      method: "POST", body: JSON.stringify(payload),
    }),

  listReleaseRequests: () => apiArray<ReleaseRequest>("/api/release-requests"),

  createReleaseRequest: (fdrId: number, requestedBy: string, reason: string) =>
    apiRequest<ReleaseRequest>(`/api/fdrs/${fdrId}/release-requests`, {
      method: "POST",
      body: JSON.stringify({ requested_by: requestedBy, reason }),
    }),

  reviewReleaseRequest: (requestId: number, status: "approved" | "rejected", reviewedBy: string, reviewRemarks: string) =>
    apiRequest<ReleaseRequest>(`/api/release-requests/${requestId}/review`, {
      method: "PATCH",
      body: JSON.stringify({ status, reviewed_by: reviewedBy, review_remarks: reviewRemarks }),
    }),

  listAuditLogs: (limit = 100, offset = 0, filters: { action?: string; entityType?: string } = {}) =>
    apiArray<AuditLog>(`/api/audit-logs${buildQuery({
      limit, offset, action: filters.action, entity_type: filters.entityType,
    })}`),

  listUsers: () => apiArray<PortalUser>("/api/auth/users"),

  createUser: (payload: UserCreatePayload) =>
    apiRequest<PortalUser>("/api/auth/users", { method: "POST", body: JSON.stringify(payload) }),

  setUserStatus: (userId: number, isActive: boolean) =>
    apiRequest<PortalUser>(`/api/auth/users/${userId}/status`, {
      method: "PATCH", body: JSON.stringify({ is_active: isActive }),
    }),

  assignUserInstitution: (userId: number, institutionId: number) =>
    apiRequest<PortalUser>(`/api/auth/users/${userId}/institution`, {
      method: "PATCH", body: JSON.stringify({ institution_id: institutionId }),
    }),
};
