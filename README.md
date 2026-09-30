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
outside this store. Suite deployment updates are reviewed and published directly
here. The companion console retains its restricted allowlisted synchronization
workflow.

## Kaspa Mining Suite 2.0 - Current Release

Version **0.7.0-pilot.1** is an experimental KAS/ZKAS merged-mining test release.
The existing UI **5560**, Kaspa-only Stratum **5556**, Kaspa P2P **16111** and
stored data are retained. The opt-in pilot uses separate Stratum TCP **5557**.

After installing or updating through this community store:

1. Check available RAM and disk space. The new ZKAS node starts syncing on
   installation and uses separate data and log directories with a 4 GiB memory
   ceiling. This limit is not a guarantee of mainnet sync performance.
2. In Settings, enter one owner's mainnet Kaspa public receive address and ZKAS
   Orchard public receive address, plus the app password displayed by Umbrel.
   Never enter a private key or seed phrase. The dashboard remains password-free.
3. Enable and save the pilot. Wait for the parent Kaspa node to synchronize and
   for the pilot to report a listening state before testing a miner.
4. Test one miner using the pilot pool and worker username shown in Settings.
   Keep its known-working Kaspa pool configuration for recovery. No miner is
   redirected automatically.

The pilot automatically continues Kaspa mining when ZKAS is unavailable.
Its chain-tagged discoveries and worker statistics are session observations,
not verified payouts or a durable ledger. Analytics and celebrations currently
cover Kaspa-only TCP 5556. Stock ASIC compatibility and physical Umbrel lifecycle
remain real-world test gates; this release does not claim they have passed.

Startup hooks create all required directories and repair narrowly scoped legacy
ownership for non-root services. RPC and auxiliary P2P ports are not exposed on
the host; do not forward Stratum or RPC ports to the public internet.

If upgrading from 0.6.2 or earlier, update every miner pool address to the Umbrel device on TCP **5556**. Before upgrading, stop any other app or service using TCP **16111**. The former **16121** P2P offset and **55556** Stratum port were temporary side-by-side testing allocations.

If you use router forwarding, configure external TCP **16111 → your Umbrel device's local IPv4 address, port 16111**. Forwarding is optional for outbound peer operation.

The upgrade briefly restarts mining services. Existing node data, settings and ledger are retained. If startup reports that port 16111 or 5556 is already allocated, stop the conflicting application and restart the suite. Do not delete existing data to resolve a port conflict.

