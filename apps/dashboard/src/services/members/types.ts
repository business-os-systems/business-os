/**
 * Team Members, Roles & Enterprise Safeguards DTOs & Interfaces (ISP & SRP).
 * Complies with Constitution Principle XII and Clean Code architecture.
 */

export interface MemberListItemDto {
  id: string;
  userId: string | null;
  name: string;
  email: string;
  mobile: string | null;
  image: string | null;
  status: "ACTIVE" | "INVITED" | "SUSPENDED" | "REVOKED";
  roleId: string;
  roleName: string;
  roleSlug: string;
  isOwner: boolean;
  isPrimaryOwner: boolean;
  roleIds: string[];
  roleNames: string[];
  branchId: string | null;
  branchName: string;
  branchIds: string[];
  branchNames: string[];
  isInvitation: boolean;
  invitationToken: string | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface RoleOptionDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isSystem: boolean;
  permissions?: string[];
}

export interface RoleRecord {
  id: string;
  name: string;
  slug: string;
  permissions?: Array<{ permission?: { action?: string } | null } | string> | null;
}

export interface BranchRecord {
  id: string;
  name: string;
}

export interface AssignedEntities {
  distinctRoles: RoleRecord[];
  distinctBranches: BranchRecord[];
  hasAllBranches: boolean;
}

export interface PendingInviteRecord {
  id: string;
  email: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
  role: RoleRecord;
}

export interface InviteMemberInput {
  email: string;
  roleId?: string;
  roleIds?: string[];
  branchId?: string | null;
  branchIds?: string[];
  redirectUrl?: string;
}

export interface UpdateMemberDetailsInput {
  name?: string;
  mobile?: string | null;
  roleId?: string;
  roleIds?: string[];
  branchId?: string | null;
  branchIds?: string[];
  managerPin?: string | null;
}

export interface UpdateMemberRoleInput {
  roleId?: string;
  roleIds?: string[];
  branchId?: string | null;
  branchIds?: string[];
}

export interface UpdateMemberStatusInput {
  status: "ACTIVE" | "SUSPENDED" | "REVOKED";
}

export interface CreateDirectMemberInput {
  name: string;
  email: string;
  mobile?: string | null;
  roleId?: string;
  roleIds?: string[];
  branchId?: string | null;
  branchIds?: string[];
  managerPin?: string | null;
}

export interface CreateDirectMemberResult {
  member: MemberListItemDto;
  inviteUrl: string;
}

export class SafeguardViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SafeguardViolationError";
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}
