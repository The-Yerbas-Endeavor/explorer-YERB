# Native Yerbas Asset Explorer

This branch integrates Yerbas Assets directly into `explorer-YERB` with MongoDB-backed asset and holder indexing plus RPC fallback.

## Included

- `/assets` searchable, filtered, sortable, paginated asset directory
- `/asset/:name` metadata, owner address, holder balances, and activity preview
- `/asset/:name/holders` dedicated holder page
- `/address/:address/assets` indexed address asset portfolio
- `/ext/assets` paginated JSON API
- `/ext/assets/status` indexer health and counts
- `/ext/assets/search?q=...` autocomplete/search API
- `/ext/asset/:name` exact asset API
- `/ext/asset/:name/holders` paginated holder API
- `/ext/asset/:name/activity` activity API scaffold
- `/ext/address/:address/assets` address portfolio API
- MongoDB collections: `assets`, `assetholders`, `assetactivities`, `assetsyncstates`
- Exact string storage and MongoDB Decimal128 sorting for holder balances
- RPC caches and controlled fallback when the Mongo index is empty
- PM2 web and five-minute asset-index schedules

## Enable the module

Run once from the explorer directory:

```bash
npm run assets-install
```

The installer mounts the asset router in `app.js` and adds the Assets navigation entry to `views/layout.pug`. It is idempotent.

## Yerbas Core requirements

```ini
server=1
assetindex=1
addressindex=1
txindex=1
```

Restart and reindex Yerbas Core if these indexes were not previously enabled.

## Initial index

Confirm `settings.json` points at the intended MongoDB database before running this command.

```bash
npm run reindex-assets
```

Normal incremental refresh:

```bash
npm run sync-assets
```

Refresh one asset:

```bash
npm run sync-asset -- ASSET_NAME
```

Tune RPC concurrency when needed:

```bash
ASSET_SYNC_CONCURRENCY=4 npm run sync-assets
```

## PM2

```bash
pm2 start ecosystem.assets.config.js
pm2 save
pm2 status
```

The processes are:

- `explorer-assets-test`: persistent explorer web process
- `explorer-assets-indexer`: asset refresh every five minutes, no automatic restart loop

## Validation

```bash
npm test
curl -fsS http://127.0.0.1:3002/assets >/dev/null
curl -fsS http://127.0.0.1:3002/ext/assets/status
curl -fsS 'http://127.0.0.1:3002/ext/assets?per_page=5'
curl -fsS 'http://127.0.0.1:3002/ext/assets/search?q=YERB'
curl -fsS http://127.0.0.1:3002/ext/asset/ASSET_NAME
curl -fsS http://127.0.0.1:3002/ext/address/YERB_ADDRESS/assets
```

Use the port configured in `settings.json`.

## Backup safety

The asset collections live in the explorer MongoDB database and are included by the existing `mongodump --archive --gzip` backup. Never run the restore or database-delete scripts against production unless a production restore is intentional.

## Activity indexing

The activity model and API are present. Populating historical issuance, reissuance, transfer, burn, restricted-asset, qualifier, and metadata-change rows requires a Yerbas-specific transaction-output parser. Until that parser is enabled, the activity endpoint returns an empty paginated result rather than querying expensive transaction history on every request.
