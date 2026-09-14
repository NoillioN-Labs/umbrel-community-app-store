# NoillioN Labs Umbrel Community App Store

One Umbrel Community App Store for software published by NoillioN Labs.

## Add this store to Umbrel

1. Open the App Store on your Umbrel.
2. Open **Community App Stores**.
3. Add `https://github.com/NoillioN-Labs/umbrel-community-app-store`.

## Crypto

### Kaspa Mining Suite 2.0

The flagship NoillioN Labs Kaspa app. It provides a dedicated Kaspa node, an
official Stratum bridge, durable mining records, worker telemetry, and a live
GhostDAG view.

### Kaspa Solo Mining Console

A companion management and monitoring app for the official Rusty Kaspa
Stratum Bridge. This app requires the `rusty-kaspad` Umbrel app.

## Future categories

Finance, tools, and other categories will appear here as new apps are released.

## Support and privacy

Use this repository's issue tracker for packaging and installation support.
Before posting logs, screenshots, diagnostics, or configuration, remove wallet
information, credentials, private addresses, miner or worker identifiers,
device details, and any other personal or sensitive data.

This is an independent community app store and is not affiliated with or
endorsed by Umbrel.

Only the deployment files required by Umbrel are published here. Application
source, builds, tests, logs, diagnostics, and private release artifacts remain
outside this store. A restricted synchronization workflow copies only the
approved runtime-file allowlist from the two package source repositories.

## Kaspa Mining Suite 2.0 — 0.6.2 upgrade

Before upgrading, stop any other app or service using TCP **16111** on Umbrel. Suite 2.0 now uses **16111 → 16111** for Kaspa P2P; the former **16121** offset was for side-by-side testing.

If you use router forwarding, configure external TCP **16111 → your Umbrel device's local IPv4 address, port 16111**. Update the destination even if your previous rule already used public port 16111. Remove the obsolete rule after checking incoming connectivity. Forwarding is optional for outbound peer operation.

The upgrade briefly restarts mining services. Existing node data, settings and ledger are retained, and miner Stratum stays on **55556**. If startup reports that port 16111 is already allocated or in use, stop the conflicting app and restart the suite. Do not delete existing data to resolve a port conflict.

For rollback to 0.6.1, restore its image and host P2P mapping **16121 → 16111**, plus the matching router destination. Keep existing data volumes.
