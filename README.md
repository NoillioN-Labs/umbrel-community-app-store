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

## Kaspa Mining Suite 2.0 — current release

Version **0.6.5** improves mobile use on iPhone and other touch devices. Analytics now stays within the screen at normal zoom, controls have reliable touch areas, and navigation and block-celebration controls respond to one tap. The celebration also includes a **Disable future pop-ups** option linked to the same preference in Settings. Application version reporting now comes directly from the packaged release and is checked before publication. Mining behaviour, stored data and network ports are unchanged. The suite uses UI **5560**, miner Stratum **5556**, and Kaspa P2P **16111 → 16111**.

If upgrading from 0.6.2 or earlier, update every miner pool address to the Umbrel device on TCP **5556**. Before upgrading, stop any other app or service using TCP **16111**. The former **16121** P2P offset and **55556** Stratum port were temporary side-by-side testing allocations.

If you use router forwarding, configure external TCP **16111 → your Umbrel device's local IPv4 address, port 16111**. Forwarding is optional for outbound peer operation.

The upgrade briefly restarts mining services. Existing node data, settings and ledger are retained. If startup reports that port 16111 or 5556 is already allocated, stop the conflicting application and restart the suite. Do not delete existing data to resolve a port conflict.

