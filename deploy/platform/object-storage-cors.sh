#!/usr/bin/env bash
#
# Object-storage CORS automation and verification (N9, T184, FR-050, T023).
#
# A presigned browser upload is a cross-origin PUT from the tenant host to the
# object store. Without a bucket CORS policy the browser blocks the request
# before it reaches storage, and the runbook used to leave that policy as a
# manual step. This script applies the policy the media adapter signs and then
# reads it back, so the deploy fails when the policy did not land.
#
# Reads the deployment environment (source the two env files first; see
# deploy/platform/README.md):
#   MEDIA_S3_ENDPOINT, MEDIA_BUCKET, MEDIA_S3_REGION,
#   MEDIA_S3_ACCESS_KEY_ID, MEDIA_S3_SECRET_ACCESS_KEY,
#   MEDIA_S3_CHECKSUM_MODE (optional: provider, the default, or metadata),
#   DASHBOARD_URL, DOMAIN_ROOT
#
# Usage: deploy/platform/object-storage-cors.sh
set -euo pipefail

readonly MAX_AGE_SECONDS=3600
readonly ORIGIN_PATTERN='^https?://[a-z0-9*]([a-z0-9.*-]*)(:[0-9]{1,5})?$'
readonly REQUIRED_METHODS=("PUT" "GET" "HEAD")
readonly BASE_ALLOWED_HEADERS=(Content-Type Content-Length x-amz-meta-checksum x-amz-meta-file-name)
readonly PROVIDER_CHECKSUM_HEADER="x-amz-checksum-sha256"
# curl signs with the credential pair read from a mode-600 config file, so the
# secret never appears in the process argument list (CWE-214).
readonly CURL_CREDENTIALS_FILE_PLACEHOLDER="curl-credentials.conf"

work_directory="$(mktemp -d)"
readonly WORK_DIRECTORY="${work_directory}"
readonly CURL_CREDENTIALS_FILE="${WORK_DIRECTORY}/${CURL_CREDENTIALS_FILE_PLACEHOLDER}"
trap 'rm -rf "${WORK_DIRECTORY}"' EXIT

fail() {
  printf 'cors: %s\n' "$1" >&2
  exit 1
}

usage_error() {
  printf 'cors: %s\n' "$1" >&2
  exit 2
}

trim() {
  local value="$1"
  value="${value#" ${value%%[![:space:]]*}"}"
  printf '%s' "${value%" ${value##*[![:space:]]}"}"
}

require_value() {
  local value
  value="$(trim "${!1:-}")"
  if [ -z "${value}" ]; then
    usage_error "${1} must hold ${2}; it is empty."
  fi
  printf '%s' "${value}"
}

require_origin() {
  local value
  value="$(require_value "$1" "$2")"
  value="${value%/}"
  if [[ ! "${value}" =~ ${ORIGIN_PATTERN} ]]; then
    usage_error "${1} must be one origin (scheme, host, optional port) with no path; received \"${value}\"."
  fi
  printf '%s' "${value}"
}

validate_credentials() {
  local value
  for value in "${MEDIA_S3_ACCESS_KEY_ID}" "${MEDIA_S3_SECRET_ACCESS_KEY}"; do
    case "${value}" in
      *'"'*|*'\'*)
        usage_error "the storage credentials contain a quote or backslash; curl cannot sign with them from a protected config file."
        ;;
    esac
  done
}

write_credentials_file() {
  local file="$1"
  printf 'user = "%s:%s"\n' "${MEDIA_S3_ACCESS_KEY_ID}" "${MEDIA_S3_SECRET_ACCESS_KEY}" >"${file}"
  chmod 600 "${file}"
}

json_array() {
  local output="" value
  for value in "$@"; do
    output="${output:+${output}, }\"${value}\""
  done
  printf '[%s]' "${output}"
}

resolve_allowed_headers() {
  local mode
  mode="$(trim "${MEDIA_S3_CHECKSUM_MODE:-}")"
  if [ "${mode}" = "metadata" ]; then
    printf '%s\n' "${BASE_ALLOWED_HEADERS[@]}"
    return 0
  fi
  printf '%s\n' "${PROVIDER_CHECKSUM_HEADER}" "${BASE_ALLOWED_HEADERS[@]}"
}

write_policy() {
  local file="$1" tenant_origin="$2" workspace_origin="$3"
  shift 3
  local headers=("$@")
  cat >"${file}" <<POLICY
[
  {
    "AllowedOrigins": $(json_array "${tenant_origin}" "${workspace_origin}"),
    "AllowedMethods": $(json_array "${REQUIRED_METHODS[@]}"),
    "AllowedHeaders": $(json_array "${headers[@]}"),
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": ${MAX_AGE_SECONDS}
  }
]
POLICY
}

# One signed request; the response body is kept for the caller and the HTTP
# status is printed. A transport failure is fatal, a provider error is reported
# with its own body so the operator sees the real reason.
s3_request() {
  local method="$1" url="$2" body_file="$3" payload="${4:-}"
  local status
  local args=(--silent --show-error --request "${method}" --aws-sigv4 "aws:amz:${MEDIA_S3_REGION}:s3" --config "${CURL_CREDENTIALS_FILE}" --output "${body_file}" --write-out '%{http_code}')
  if [ -n "${payload}" ]; then
    args+=(--header "Content-Type: application/json" --data-binary "@${payload}")
  fi
  status="$(curl "${args[@]}" "${url}")" || fail "${method} ${url} could not be sent; check the endpoint and network."
  case "${status}" in
    2??) printf '%s' "${status}" ;;
    *)
      printf 'cors: %s %s returned %s\n' "${method}" "${url}" "${status}" >&2
      head -c 400 "${body_file}" >&2 || true
      printf '\n' >&2
      fail "the object store rejected the CORS request."
      ;;
  esac
}

assert_policy_applied() {
  local body_file="$1"
  shift
  local expected
  for expected in "$@"; do
    if ! grep -Fq "${expected}" "${body_file}"; then
      fail "the bucket CORS policy read back does not contain \"${expected}\"."
    fi
  done
}

main() {
  local endpoint bucket region tenant_root workspace_url tenant_origin workspace_origin
  endpoint="$(require_value MEDIA_S3_ENDPOINT "the storage endpoint")"
  bucket="$(require_value MEDIA_BUCKET "the media bucket name")"
  region="$(require_value MEDIA_S3_REGION "the storage region")"
  MEDIA_S3_ACCESS_KEY_ID="$(require_value MEDIA_S3_ACCESS_KEY_ID "the storage access key id")"
  MEDIA_S3_SECRET_ACCESS_KEY="$(require_value MEDIA_S3_SECRET_ACCESS_KEY "the storage secret access key")"
  tenant_root="$(require_value DOMAIN_ROOT "the tenant host root")"
  workspace_url="$(require_origin DASHBOARD_URL "the workspace origin")"
  tenant_origin="https://*.${tenant_root}"
  workspace_origin="${workspace_url%/}"

  local headers=()
  while IFS= read -r header; do
    headers+=("${header}")
  done < <(resolve_allowed_headers)

  validate_credentials
  write_credentials_file "${CURL_CREDENTIALS_FILE}"

  local policy="${WORK_DIRECTORY}/cors-policy.json"
  write_policy "${policy}" "${tenant_origin}" "${workspace_origin}" "${headers[@]}"

  local cors_url="${endpoint%/}/${bucket}?cors"
  local response="${WORK_DIRECTORY}/cors-response.xml"
  s3_request PUT "${cors_url}" "${response}" "${policy}" >/dev/null
  s3_request GET "${cors_url}" "${response}" >/dev/null

  local expectations=("${tenant_origin}" "${workspace_origin}" "${headers[@]}" "${REQUIRED_METHODS[@]}" "ETag")
  assert_policy_applied "${response}" "${expectations[@]}"
  printf 'cors: bucket %s allows %s and %s for browser uploads.\n' "${bucket}" "${tenant_origin}" "${workspace_origin}"
}

main "$@"
