#!/usr/bin/env bash

# Umbrel evaluates this on the host. The values are passed to the app at runtime
# only so the dashboard can show miners the device's LAN connection address.
primary_ip=$(ip -4 route get 1 2>/dev/null | awk '{for (i=1; i<=NF; i++) if ($i == "src") {print $(i+1); exit}}') || primary_ip=""
local_ips=$(hostname --all-ip-addresses 2>/dev/null | tr ' ' ',') || local_ips=""
export APP_KASPA_STRATUM_MANAGER_LOCAL_IPS="${primary_ip},${local_ips}"
