import { prisma } from "@suite/db";
import {
  setManagerOverridePin,
  setTerminalPin,
  verifyManagerOverridePin,
  verifyTerminalPin,
} from "@suite/auth";
import { getBetterAuthSecret } from "../../lib/env.js";

export interface TerminalSwitchInput {
  readonly pin: string;
  readonly organizationId: string;
  readonly terminalKey?: string;
  readonly branchId?: string | null;
}

export interface TerminalPinInput {
  readonly userId: string;
  readonly organizationId: string;
  readonly newPin: string;
}

export interface ManagerPinInput {
  readonly userId: string;
  readonly newManagerPin: string;
}

export interface ManagerOverrideInput {
  readonly managerPin: string;
  readonly action: string;
  readonly targetEntityId: string;
  readonly reason: string;
  readonly organizationId: string;
  readonly managerUserId?: string;
}

export async function verifyTerminalSwitch(input: TerminalSwitchInput) {
  return verifyTerminalPin({
    pin: input.pin,
    organizationId: input.organizationId,
    terminalKey: input.terminalKey,
    branchId: input.branchId,
    prisma,
  });
}

export async function configureTerminalPin(input: TerminalPinInput) {
  return setTerminalPin({
    userId: input.userId,
    organizationId: input.organizationId,
    newPin: input.newPin,
    prisma,
  });
}

export async function configureManagerOverridePin(input: ManagerPinInput) {
  return setManagerOverridePin({
    userId: input.userId,
    newManagerPin: input.newManagerPin,
    prisma,
  });
}

export async function verifyManagerOverride(input: ManagerOverrideInput) {
  return verifyManagerOverridePin({
    managerPin: input.managerPin,
    action: input.action,
    targetEntityId: input.targetEntityId,
    reason: input.reason,
    organizationId: input.organizationId,
    managerUserId: input.managerUserId,
    secretKey: getBetterAuthSecret(),
    prisma,
  });
}
