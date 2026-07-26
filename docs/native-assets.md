# Native Yerbas Asset Explorer

This branch begins the native port of `Yerbas-Assets-Viewer` into `explorer-YERB`.

## Included in this milestone

- `/assets` searchable, filtered, paginated asset directory
- `/asset/:name` metadata, owner address, and holder balances
- `/address/:address/assets` address asset portfolio
- `/ext/assets` paginated JSON API
- `/ext/asset/:name` exact asset JSON API
- `/ext/address/:address/assets` address portfolio JSON API
- Explorer-native Pug templates and Bootstrap styling
- Existing Yerbas RPC configuration through `lib/node.js`
- No PHP, PHP-FPM, or SQLite dependency

## Enable the module

From the explorer directory, run once:

```bash
node scripts/install_native_assets.js
```

The installer adds the asset router to `app.js` and an **Assets** navigation entry to `views/layout.pug`. It is idempotent and may be run again safely.

Review the generated changes before committing:

```bash
git diff -- app.js views/layout.pug
```

## Yerbas Core requirements

The connected Yerbas Core node must have the following indexes enabled:

```ini
server=1
assetindex=1
addressindex=1
txindex=1
```

Restart and reindex Yerbas Core if these indexes were not previously enabled.

## Validate

```bash
npm test
npm start
```

Then test:

```bash
curl -s http://127.0.0.1:3001/ext/assets?per_page=5
curl -s http://127.0.0.1:3001/ext/asset/ASSET_NAME
curl -s http://127.0.0.1:3001/ext/address/YERB_ADDRESS/assets
```

Use the port configured in `settings.json`.

## Next milestone

The next phase replaces full RPC scans with MongoDB-backed asset, holder, activity, and synchronization collections. It will add incremental indexing, issue/transfer/reissue activity, live polling, statistics, and unified explorer search.
