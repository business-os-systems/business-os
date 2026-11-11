#!/usr/bin/env bash
#
# Post-deploy tenant smoke check (N3, T178, FR-109, SC-017).
#
# Proves, over TLS with the certificate verified, that one real tenant host:
#   /              serves the published storefront (or its holding state),
#   /dashboard     reaches the workspace application, not the storefront,
#   /robots.txt    is the storefront metadata file for that host,
# and that the storefront and the workspace sign-in both load their /_next
# assets through the edge, where the two Next.js applications share one asset
# namespace.
#
# The check runs after the stack reports healthy; a host that does not answer is
# a failed deploy, not a warning. Usage:
#   deploy/platform/smoke-tenant-host.sh [tenant-host]
# The host also comes from SMOKE_TENANT_HOST, which the deploy env declares.
set -euo pipefail

readonly REQUEST_TIMEOUT_SECONDS=15
readonly RETRY_COUNT=2
readonly RETRY_DELAY_SECONDS=2
readonly HOSTNAME_PATTERN='^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$'
readonly LOGIN_PATH="/login"

work_directory="$(mktemp -d)"
readonly WORK_DIRECTORY="${work_directory}"
trap 'rm -rf "${WORK_DIRECTORY}"' EXIT

fail() {
  printf 'smoke: %s\n' "$1" >&2
  exit 1
}

usage_error() {
  printf 'smoke: %s\n' "$1" >&2
  exit 2
}

trim() {
  local value="$1"
  value="${value#" ${value%%[![:space:]]*}"}"
  printf '%s' "${value%" ${value##*[![:space:]]}"}"
}

resolve_host() {
  local host
  host="$(trim "${1:-${SMOKE_TENANT_HOST:-}}")"
  if [ -z "${host}" ]; then
    usage_error "SMOKE_TENANT_HOST must name the tenant host to prove, for example canary.<DOMAIN_ROOT>."
  fi
  if [[ ! "${host}" =~ ${HOSTNAME_PATTERN} ]]; then
    usage_error "the tenant host must be a bare lowercase hostname (no scheme, port or path); received \"${host}\"."
  fi
  printf '%s' "${host}"
}

# Requests one path and stores the body and headers, printing the status code.
request() {
  local url="$1" body_file="$2" header_file="$3"
  curl --silent --show-error --max-time "${REQUEST_TIMEOUT_SECONDS}" \
    --retry "${RETRY_COUNT}" --retry-delay "${RETRY_DELAY_SECONDS}" --retry-connrefused \
    --output "${body_file}" --dump-header "${header_file}" --write-out '%{http_code}' \
    "${url}" || fail "request to ${url} failed; the host is not serving."
}

read_header() {
  local header_file="$1" name="$2"
  awk -v header_name="${name}" '
    index(tolower($0), tolower(header_name) ":") == 1 {
      value = substr($0, length(header_name) + 2)
      sub(/^[[:space:]]+/, "", value)
      sub(/[[:space:]]+$/, "", value)
      found = value
    }
    END { print found }
  ' "${header_file}"
}

check_storefront_root() {
  local base_url="$1"
  local body="${WORK_DIRECTORY}/root.html" headers="${WORK_DIRECTORY}/root.headers"
  local status
  status="$(request "${base_url}/" "${body}" "${headers}")"
  if [ "${status}" != "200" ]; then
    fail "GET ${base_url}/ returned ${status}; the storefront must serve the tenant root with 200."
  fi
  case "$(read_header "${headers}" "content-type")" in
    text/html*) ;;
    *) fail "GET ${base_url}/ did not return HTML; the storefront is not what answered." ;;
  esac
  if [ ! -s "${body}" ]; then
    fail "GET ${base_url}/ returned an empty body."
  fi
  # The public tenant root never carries a session (FR-110, FR-111).
  if [ -n "$(read_header "${headers}" "set-cookie")" ]; then
    fail "GET ${base_url}/ set a cookie; the public storefront must stay session-free."
  fi
  printf 'smoke: ok  %s/ serves the storefront\n' "${base_url}"
  assert_assets_served "${base_url}" "${body}"
}

# Both applications emit /_next asset URLs from the tenant origin. A page whose
# assets do not come back through the edge is unstyled or cannot hydrate, so the
# smoke check loads one asset from each application.
assert_assets_served() {
  local base_url="$1" body_file="$2"
  local asset status
  asset="$(grep -oE '/_next/static/[^"?]+\.(js|css)' "${body_file}" | head -n 1)"
  if [ -z "${asset}" ]; then
    fail "the page at ${base_url} carries no /_next asset URL; the edge did not serve a Next.js page."
  fi
  status="$(request "${base_url}${asset}" "${WORK_DIRECTORY}/asset.body" "${WORK_DIRECTORY}/asset.headers")"
  if [ "${status}" != "200" ]; then
    fail "GET ${base_url}${asset} returned ${status}; the page cannot load its own assets through the edge."
  fi
  printf 'smoke: ok  %s loads its Next assets through the edge\n' "${base_url}"
}

check_workspace() {
  local base_url="$1" host="$2"
  local body="${WORK_DIRECTORY}/dashboard.html" headers="${WORK_DIRECTORY}/dashboard.headers"
  local status location
  status="$(request "${base_url}/dashboard" "${body}" "${headers}")"
  case "${status}" in
    200)
      printf 'smoke: ok  %s/dashboard serves the workspace\n' "${base_url}"
      ;;
    301|302|303|307|308)
      location="$(read_header "${headers}" "location")"
      assert_workspace_redirect "${base_url}" "${host}" "${location}"
      ;;
    *)
      fail "GET ${base_url}/dashboard returned ${status}; the workspace must answer or redirect to sign-in."
      ;;
  esac
}

# An unauthenticated workspace request redirects to the sign-in page on the same
# tenant host. A redirect anywhere else means the edge routed to the wrong app.
assert_workspace_redirect() {
  local base_url="$1" host="$2" location="$3"
  case "${location}" in
    "${LOGIN_PATH}"*) ;;
    "https://${host}${LOGIN_PATH}"*) ;;
    http://*|https://*)
      fail "GET ${base_url}/dashboard redirected off the tenant host to \"${location}\"."
      ;;
    /*)
      fail "GET ${base_url}/dashboard redirected to \"${location}\", not to the workspace sign-in page."
      ;;
    *)
      fail "GET ${base_url}/dashboard returned no usable Location header."
      ;;
  esac
  printf 'smoke: ok  %s/dashboard reaches the workspace sign-in\n' "${base_url}"
}

check_workspace_signin() {
  local base_url="$1"
  local body="${WORK_DIRECTORY}/login.html" headers="${WORK_DIRECTORY}/login.headers"
  local status
  status="$(request "${base_url}${LOGIN_PATH}" "${body}" "${headers}")"
  if [ "${status}" != "200" ]; then
    fail "GET ${base_url}${LOGIN_PATH} returned ${status}; the workspace sign-in page is not served."
  fi
  printf 'smoke: ok  %s%s serves the workspace sign-in\n' "${base_url}" "${LOGIN_PATH}"
  assert_assets_served "${base_url}" "${body}"
}

check_robots() {
  local base_url="$1"
  local body="${WORK_DIRECTORY}/robots.txt" headers="${WORK_DIRECTORY}/robots.headers"
  local status
  status="$(request "${base_url}/robots.txt" "${body}" "${headers}")"
  if [ "${status}" != "200" ]; then
    fail "GET ${base_url}/robots.txt returned ${status}; the storefront must serve it for the tenant host."
  fi
  case "$(read_header "${headers}" "content-type")" in
    text/plain*) ;;
    *) fail "GET ${base_url}/robots.txt did not return text/plain." ;;
  esac
  if ! grep -q '^Disallow:' "${body}"; then
    fail "GET ${base_url}/robots.txt carries no Disallow directive; it is not the storefront robots file."
  fi
  printf 'smoke: ok  %s/robots.txt serves the storefront robots file\n' "${base_url}"
}

main() {
  local host
  host="$(resolve_host "${1:-}")"
  local base_url="https://${host}"
  check_storefront_root "${base_url}"
  check_workspace "${base_url}" "${host}"
  check_workspace_signin "${base_url}"
  check_robots "${base_url}"
  printf 'smoke: tenant host %s serves the storefront and the workspace.\n' "${host}"
}

main "$@"
