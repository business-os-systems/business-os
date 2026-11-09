import { prisma } from "@suite/db";
import { enqueueEmail } from "@suite/redis";
import { hashPassword } from "@suite/auth/password";

const CREDENTIAL_PROVIDER_ID = "credential";

export interface CreatedAccountDto {
  readonly id: string;
  readonly email: string;
  readonly name: string;
}

export type RegisterAccountResult =
  | { readonly status: "existing_account" }
  | { readonly status: "created"; readonly user: CreatedAccountDto };

export function deriveNameFromEmail(email: string): string {
  const localPart = email.split("@")[0] ?? "User";
  const cleaned = localPart.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return "User";
  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function buildExistingAccountNotice(email: string, origin: string) {
  const loginUrl = origin + "/login?email=" + encodeURIComponent(email);
  const resetUrl = origin + "/forgot-password?email=" + encodeURIComponent(email);

  return {
    to: email,
    subject: "Security Notification: Registration Attempt - Business OS",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1E1B19;">Account Registration Attempt</h2>
        <p style="color: #5C504B; font-size: 15px; line-height: 1.5;">
          Someone attempted to register a new Business OS workspace using this email address. Since you already have an active account, you can sign in directly or choose a new password.
        </p>
        <div style="margin: 24px 0;">
          <a href="${loginUrl}" style="background-color: #0F766E; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block; margin-right: 12px;">Sign In</a>
          <a href="${resetUrl}" style="background-color: #F3F4F6; color: #1E1B19; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Reset Password</a>
        </div>
      </div>
    `,
    text: `Someone attempted to register a new account with your email. If this was you, sign in at: ${loginUrl} or reset your password at: ${resetUrl}`,
  };
}

async function dispatchExistingAccountNotice(email: string, origin: string): Promise<void> {
  try {
    await enqueueEmail(buildExistingAccountNotice(email, origin));
  } catch {
    // The generic response must not reveal whether the account existed, so a
    // failed security notice never turns registration into an error path.
  }
}

async function createCredentialAccount(input: {
  readonly email: string;
  readonly password: string;
  readonly name?: string;
}): Promise<CreatedAccountDto> {
  const hashedPassword = await hashPassword(input.password);
  const resolvedName = input.name?.trim() ? input.name.trim() : deriveNameFromEmail(input.email);

  return prisma.user.create({
    data: {
      email: input.email,
      name: resolvedName,
      emailVerified: false,
      metadata: {
        onboarding_status: "IN_PROGRESS",
        current_onboarding_step: 1,
        theme_preference: "system",
      },
      accounts: {
        create: {
          accountId: input.email,
          providerId: CREDENTIAL_PROVIDER_ID,
          password: hashedPassword,
        },
      },
    },
    select: { id: true, email: true, name: true },
  });
}

export async function registerCredentialAccount(input: {
  readonly email: string;
  readonly password: string;
  readonly name?: string;
  readonly origin: string;
}): Promise<RegisterAccountResult> {
  const existingUser = await prisma.user.findUnique({ where: { email: input.email } });
  if (existingUser) {
    await dispatchExistingAccountNotice(input.email, input.origin);
    return { status: "existing_account" };
  }

  const user = await createCredentialAccount({
    email: input.email,
    password: input.password,
    name: input.name,
  });
  return { status: "created", user };
}
