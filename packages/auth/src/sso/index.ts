export {
  resolveSsoProviderByEmail,
  extractDomainFromEmail,
  isPublicEmailDomain,
  PUBLIC_EMAIL_DOMAINS,
  type SsoDiscoveryResult,
} from "./domain-discovery.js";

export {
  provisionJitSsoUser,
  type ProvisionJitUserParams,
  type JitProvisionedResult,
} from "./jit-provisioning.js";
