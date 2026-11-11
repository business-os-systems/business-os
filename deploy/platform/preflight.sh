#!/usr/bin/env bash
#
# Deployment preflight (N4, T179, FR-117).
#
# Fails the deploy before any container starts when a required host, origin,
# database or storage value is missing or malformed. The deployment env is the
# union of the root app env and the deploy env, sourced in compose order (root
# first, deploy second, so the deploy file wins) and then validated.
#
# The edge keys are also checked against the deploy env file alone, because the
# Caddy service loads that file and nothing else: a value that lives only in the
# root app env would pass a merged check and still leave the edge unconfigured.
#
# Usage:
#   deploy/platform/preflight.sh [app-env-file] [deploy-env-file]
#
# Every failure names the variable and what it must hold, so an operator can fix
# the deployment file without reading this script.
set -euo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
readonly DEFAULT_APP_ENV="${REPO_ROOT}/.env"
readonly DEFAULT_DEPLOY_ENV="${SCRIPT_DIR}/.env"

readonly HOSTNAME_PATTERN='^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$'
readonly HTTP_URL_PATTERN='^https?://[^[:space:]/]+'
readonly POSTGRES_URL_PATTERN='^postgres(ql)?://[^[:space:]/]+/[^[:space:]]+'

# Keys the Caddyfile interpolates; Caddy reads only the deploy env file.
readonly EDGE_KEYS=(DOMAIN_ROOT MARKETING_HOST OPERATOR_HOST BREAK_GLASS_DOMAIN ACME_EMAIL BREAK_GLASS_CA_CERT_PATH TENANT_TLS_DIR SMOKE_TENANT_HOST)

failure_count=0

report_failure() {
  printf 'preflight: %s\n' "$1" >&2
  failure_count=$((failure_count + 1))
}

trim() {
  local value="$1"
  value="${value#" ${value%%[![:space:]]*}"}"
  printf '%s' "${value%" ${value##*[![:space:]]}"}"
}

# The value of one variable, trimmed. Callers capture this and report in the
# parent shell, because a command substitution runs in a subshell where a
# failure count would be lost.
raw_value() {
  trim "${!1:-}"
}

report_missing() {
  report_failure "$1 is empty; it must hold $2."
}

validate_hostname() {
  local value
  value="$(raw_value "$1")"
  if [ -z "${value}" ]; then
    report_missing "$1" "$2"
    return 0
  fi
  if [[ ! "${value}" =~ ${HOSTNAME_PATTERN} ]]; then
    report_failure "$1 must be a bare lowercase hostname (no scheme, port or path); received \"${value}\"."
  fi
}

validate_http_url() {
  local value
  value="$(raw_value "$1")"
  if [ -z "${value}" ]; then
    report_missing "$1" "$2"
    return 0
  fi
  if [[ ! "${value}" =~ ${HTTP_URL_PATTERN} ]]; then
    report_failure "$1 must be an absolute http(s) URL; received \"${value}\"."
  fi
}

validate_postgres_url() {
  local value
  value="$(raw_value "$1")"
  if [ -z "${value}" ]; then
    report_missing "$1" "$2"
    return 0
  fi
  if [[ ! "${value}" =~ ${POSTGRES_URL_PATTERN} ]]; then
    report_failure "$1 must be a postgresql:// URL with a database name; it is not one."
  fi
}

validate_required_value() {
  local value
  value="$(raw_value "$1")"
  if [ -z "${value}" ]; then
    report_missing "$1" "$2"
  fi
}

validate_distinct_hosts() {
  local first="${!1-}" second="${!2-}"
  if [ -z "${first}" ] || [ -z "${second}" ]; then
    return 0
  fi
  if [ "${first}" = "${second}" ]; then
    report_failure "$1 and $2 name the same host; every host role must be distinct."
  fi
}

validate_host_roles() {
  validate_hostname DOMAIN_ROOT "the tenant host root"
  validate_hostname MARKETING_HOST "the reserved marketing/account-entry host"
  validate_hostname OPERATOR_HOST "the operator console host"
  validate_hostname BREAK_GLASS_DOMAIN "the break-glass recovery host"
  validate_distinct_hosts DOMAIN_ROOT MARKETING_HOST
  validate_distinct_hosts DOMAIN_ROOT OPERATOR_HOST
  validate_distinct_hosts MARKETING_HOST OPERATOR_HOST
}

validate_smoke_host() {
  local value root
  value="$(raw_value SMOKE_TENANT_HOST)"
  if [ -z "${value}" ]; then
    report_missing SMOKE_TENANT_HOST "one real tenant host the smoke check proves"
    return 0
  fi
  if [[ ! "${value}" =~ ${HOSTNAME_PATTERN} ]]; then
    report_failure "SMOKE_TENANT_HOST must be a bare lowercase hostname; received \"${value}\"."
    return 0
  fi
  root="$(raw_value DOMAIN_ROOT)"
  if [ -z "${root}" ]; then
    return 0
  fi
  case "${value}" in
    *".${root}")
      if [[ "${value%".${root}"}" == *.* ]]; then
        report_failure "SMOKE_TENANT_HOST must be one label under DOMAIN_ROOT, not a nested host."
      fi
      ;;
    *)
      report_failure "SMOKE_TENANT_HOST must be a tenant host under DOMAIN_ROOT (\"${root}\"); received \"${value}\"."
      ;;
  esac
}

validate_sources() {
  validate_http_url API_URL "the API origin the applications call"
  validate_http_url DASHBOARD_URL "the workspace origin"
  validate_postgres_url TENANT_DATABASE_URL "the tenant runtime database identity"
}

validate_media() {
  validate_required_value MEDIA_BUCKET "the media bucket name"
  validate_http_url MEDIA_S3_ENDPOINT "the S3-compatible storage endpoint"
  validate_required_value MEDIA_S3_REGION "the storage region"
  validate_required_value MEDIA_S3_ACCESS_KEY_ID "the storage access key id"
  validate_required_value MEDIA_S3_SECRET_ACCESS_KEY "the storage secret access key"
  validate_http_url MEDIA_PUBLIC_BASE_URL "the public media base URL"
}

validate_tls_material() {
  local directory file
  directory="$(raw_value TENANT_TLS_DIR)"
  if [ -z "${directory}" ]; then
    report_missing TENANT_TLS_DIR "the directory with the wildcard tenant certificate"
    return 0
  fi
  if [ ! -d "${directory}" ]; then
    report_failure "TENANT_TLS_DIR must name an existing directory; \"${directory}\" is not one."
    return 0
  fi
  for file in fullchain.pem privkey.pem; do
    if [ ! -s "${directory}/${file}" ]; then
      report_failure "TENANT_TLS_DIR must contain a non-empty ${file}; \"${directory}/${file}\" is missing or empty."
    fi
  done
}

source_env_file() {
  local file="$1" label="$2"
  if [ ! -f "${file}" ]; then
    report_failure "the ${label} env file (${file}) does not exist; copy the matching .env.example to it."
    return 0
  fi
  set -a
  # shellcheck disable=SC1090 # the deployment, not this script, owns the path
  . "${file}"
  set +a
}

# Reads one key from one file in an isolated subshell, so a value inherited from
# the other env file cannot make a missing edge value look configured.
read_file_value() {
  local file="$1" name="$2"
  (
    unset "${name}" || true
    set -a
    # shellcheck disable=SC1090 # the deployment, not this script, owns the path
    . "${file}" >/dev/null 2>&1
    printf '%s' "${!name:-}"
  )
}

validate_edge_env_file() {
  local file="$1" name value
  for name in "${EDGE_KEYS[@]}"; do
    value="$(trim "$(read_file_value "${file}" "${name}")")"
    if [ -z "${value}" ]; then
      report_failure "the deploy env file must declare ${name}; Caddy reads only that file."
    fi
  done
}

main() {
  local app_env="${1:-${DEFAULT_APP_ENV}}"
  local deploy_env="${2:-${DEFAULT_DEPLOY_ENV}}"
  source_env_file "${app_env}" "app"
  source_env_file "${deploy_env}" "deploy"
  validate_edge_env_file "${deploy_env}"
  validate_host_roles
  validate_sources
  validate_media
  validate_tls_material
  validate_smoke_host
  if [ "${failure_count}" -gt 0 ]; then
    printf 'preflight: %d problem(s) found; the deploy is blocked.\n' "${failure_count}" >&2
    return 1
  fi
  printf 'preflight: host, origin, database and storage configuration is complete.\n'
}

main "$@"
