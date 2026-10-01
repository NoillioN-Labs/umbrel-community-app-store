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

Version **0.8.0** supports Kaspa-only mining and optional KAS + ZKAS merged mining.
UI **5560**, Kaspa-only Stratum **5556**, merged Stratum **5558** and Kaspa P2P
**16111** retain their existing ports. Existing addresses, data paths, service
identities and the scoped ownership-repair hook are preserved.

This release includes both reporting sources in Overview hashrate history and
centres the average below the graph. New fleet history starts after updating;
earlier merged-mining samples are not reconstructed. Analytics lists saved
KAS/ZKAS discoveries separately from Kaspa-only bridge reward charts and
estimates. Node visibility does not establish rewards, maturity or wallet credit.
IN peer badges are purple and OUT badges teal in both themes. Connection help
shows the selected endpoint and the correct miner credentials.

**Download a database backup before updating.** This release migrates to schema 8.
An older runtime cannot open the upgraded database; rollback requires a compatible
pre-update backup. Update through this store, without uninstalling or deleting
app data. Mining services briefly restart during the update.

### Kaspa-only mining

Connect ASICs to TCP **5556**, use a public KAS address followed by a dot and
worker name as the username, and optionally use `x` as the password. No ZKAS
address is needed. Merged mining starts disabled on a fresh installation.
To switch an existing miner back to Kaspa-only, move its pool configuration to
5556 first, then uncheck **Enable merged mining** in Settings and save using the
Umbrel app password. Disabling closes 5558; miners are not redirected automatically.
Saved addresses and discoveries remain, and the ZKAS node continues running.

### Optional merged mining

Check available RAM and disk space. The separate ZKAS node has a 4 GiB memory
ceiling; this is not a guarantee of mainnet synchronization performance.
In Settings, save one owner's mainnet KAS and ZKAS Orchard public receive
addresses, using the app password displayed by Umbrel. Enable merged mining and
wait for the Kaspa node to synchronize and the gateway to report listening.

Connect the miner to TCP **5558**, with `ZKAS-address.worker` as its username
and the **bare public KAS address** as its required pool password. That pool
password is not the Umbrel app password. Keep the receive addresses in app
Settings free of worker suffixes. The dashboard remains password-free; configuration
writes require the app password. Never enter a private key or seed phrase.

The gateway supports Kaspa fallback when ZKAS is unavailable. Saved discoveries
are polled observations, not a lossless submission journal: a crash before
polling can lose an unobserved discovery. Automatic merged-mining reward
attribution and maturity remain unfinished. Hardware compatibility and physical
outage/recovery testing remain separate from automated release checks.

Startup hooks create and repair only the app's declared persistent directories
for UID/GID 1000 services. RPC and auxiliary P2P ports are not exposed on the host.
Do not forward Stratum or RPC ports to the public internet. Optional Kaspa peer
forwarding is external TCP **16111** to the Umbrel device's local TCP **16111**.
If a port is already allocated, resolve the conflict without deleting app data.
