export type User = {
  id?: number;
  full_name?: string;
  email: string;
  role?: string;
  institution_id?: number | null;
  is_active?: boolean;
};

export type PortalUser = {
  id: number;
  full_name: string;
  email: string;
  role: string;
  institution_id: number | null;
  is_active: boolean;
  created_at?: string;
};

export type FDR = {
  id: number;
  institution_id: number;
  fdr_number: string;
  bank_name: string;
  branch_name?: string | null;
  deposit_amount: number | string;
  issue_date: string;
  maturity_date: string;
  interest_rate?: number | string | null;
  certificate_path?: string | null;
  status: string;
};

export type Institution = {
  id: number;
  name: string;
  institution_code?: string;
  email?: string;
  phone?: string | null;
  address?: string | null;
  is_active?: boolean;
};

export type ReleaseRequest = {
  id: number;
  fdr_id: number;
  requested_by?: string;
  reason?: string;
  status?: string;
  reviewed_by?: string | null;
  review_remarks?: string | null;
  created_at?: string;
  reviewed_at?: string | null;
};

export type Verification = {
  id: number;
  fdr_id: number;
  method: string;
  result: string;
  reference_number?: string | null;
  remarks?: string | null;
  checked_by?: string | null;
  created_at: string;
};

export type AuditLog = {
  id: number;
  actor: string;
  action: string;
  entity_type: string;
  entity_id?: number | null;
  details?: Record<string, unknown> | null;
  ip_address?: string | null;
  created_at: string;
};

export type FdrPayload = {
  institution_id: number;
  fdr_number: string;
  bank_name: string;
  branch_name: string | null;
  deposit_amount: string;
  issue_date: string;
  maturity_date: string;
  interest_rate: string | null;
};

export type LoginResponse = {
  access_token: string;
  token_type: string;
  user: User;
};

export type Page =
  | "Dashboard"
  | "FDR Registry"
  | "FDR Details"
  | "Verification"
  | "Release Requests"
  | "Institutions"
  | "Audit Trail"
  | "User Management"
  | "Reports";

export type RegistryFilters = {
  search?: string;
  status?: string;
  institutionId?: number | null;
  bank?: string;
  maturityWindow?: "all" | "30d" | "90d" | "matured";
  openRegister?: boolean;
};

export type NavigatePayload = {
  fdrId?: number;
  registryFilters?: RegistryFilters;
};

export type NavigateFn = (page: Page, payload?: NavigatePayload) => void;
