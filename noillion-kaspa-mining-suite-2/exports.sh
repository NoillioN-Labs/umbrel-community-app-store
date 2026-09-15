export APP_KASPA_SUITE_STRATUM_PORT=55556
APP_KASPA_SUITE_LAN_HOST=$(ip -4 route get 1 2>/dev/null | awk '{for (i=1; i<=NF; i++) if ($i == "src") {print $(i+1); exit}}') || APP_KASPA_SUITE_LAN_HOST=""
export APP_KASPA_SUITE_LAN_HOST="${APP_KASPA_SUITE_LAN_HOST:-${DEVICE_DOMAIN_NAME:-umbrel.local}}"
