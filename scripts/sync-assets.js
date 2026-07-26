'use strict';

const mongoose = require('mongoose');
const settings = require('../lib/settings');
const assetRpc = require('../lib/assets');
const Asset = require('../models/asset');
const AssetHolder = require('../models/assetholder');
const AssetSyncState = require('../models/assetsyncstate');

const mode = String(process.argv[2] || 'update').toLowerCase();
const selectedAsset = process.argv[3] || '';
const concurrency = Math.max(1, Math.min(12, Number(process.env.ASSET_SYNC_CONCURRENCY) || 4));

function mongoUri() {
  const auth = settings.dbsettings.user ? encodeURIComponent(settings.dbsettings.user) + ':' + encodeURIComponent(settings.dbsettings.password || '') + '@' : '';
  return 'mongodb://' + auth + settings.dbsettings.address + ':' + settings.dbsettings.port + '/' + settings.dbsettings.database;
}

function decimalString(value) {
  if (value == null || value === '') return '0';
  return String(value);
}

async function mapLimit(items, limit, worker) {
  let cursor = 0;
  const runners = Array.from({length: Math.min(limit, items.length || 1)}, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

async function indexOne(name) {
  const metadata = await assetRpc.rpc('getassetdata', [name]);
  const normalized = assetRpc.normalizeAsset(name, metadata);
  const holdersRaw = await assetRpc.rpc('listaddressesbyasset', [name]).catch(() => ({}));
  const holders = Object.entries(holdersRaw && typeof holdersRaw === 'object' ? holdersRaw : {})
    .filter((entry) => decimalString(entry[1]) !== '0');
  const issuerRaw = await assetRpc.rpc('listaddressesbyasset', [name + '!']).catch(() => ({}));
  const issuer = issuerRaw && typeof issuerRaw === 'object' ? Object.keys(issuerRaw) : [];

  let total = mongoose.Types.Decimal128.fromString('0');
  for (const [, balance] of holders) {
    const current = mongoose.Types.Decimal128.fromString(decimalString(balance));
    total = mongoose.Types.Decimal128.fromString((Number(total.toString()) + Number(current.toString())).toString());
  }

  await Asset.updateOne({name}, {$set: {
    name,
    name_upper: name.toUpperCase(),
    type: normalized.type,
    amount: decimalString(normalized.amount),
    units: normalized.units,
    reissuable: normalized.reissuable,
    has_ipfs: normalized.has_ipfs,
    ipfs_hash: normalized.ipfs_hash,
    ipfs_url: normalized.ipfs_url,
    issuer,
    holder_count: holders.length,
    total_holder_balance: total.toString(),
    indexed_at: new Date(),
    last_error: ''
  }}, {upsert: true});

  const seen = [];
  for (const [address, balanceValue] of holders) {
    const balance = decimalString(balanceValue);
    seen.push(address);
    await AssetHolder.updateOne({asset: name, address}, {$set: {
      asset: name,
      address,
      balance,
      balance_sort: mongoose.Types.Decimal128.fromString(balance),
      indexed_at: new Date()
    }}, {upsert: true});
  }
  await AssetHolder.deleteMany({asset: name, address: {$nin: seen}});
}

async function main() {
  if (!['update', 'reindex', 'asset'].includes(mode)) throw new Error('Usage: node scripts/sync-assets.js [update|reindex|asset NAME]');
  await mongoose.connect(mongoUri());
  const state = await AssetSyncState.findOneAndUpdate({key: 'assets'}, {$set: {
    status: 'running', started_at: new Date(), completed_at: null, last_error: '', processed_assets: 0, failed_assets: 0
  }}, {upsert: true, new: true});

  try {
    if (mode === 'reindex') {
      await Promise.all([Asset.deleteMany({}), AssetHolder.deleteMany({})]);
    }
    let names;
    if (mode === 'asset') {
      if (!selectedAsset) throw new Error('Asset name is required');
      names = [selectedAsset];
    } else {
      const raw = await assetRpc.rpc('listassets', []);
      names = Array.isArray(raw) ? raw : Object.keys(raw || {});
    }

    let processed = 0;
    let failed = 0;
    await mapLimit(names, concurrency, async (name) => {
      try {
        await indexOne(name);
        processed++;
      } catch (err) {
        failed++;
        await Asset.updateOne({name}, {$set: {name, name_upper: name.toUpperCase(), type: assetRpc.inferType(name), indexed_at: new Date(), last_error: err.message}}, {upsert: true});
        console.error('[asset-sync] ' + name + ': ' + err.message);
      }
      await AssetSyncState.updateOne({_id: state._id}, {$set: {processed_assets: processed, failed_assets: failed}});
    });

    const [assetCount, holderCount] = await Promise.all([Asset.countDocuments({}), AssetHolder.countDocuments({})]);
    await AssetSyncState.updateOne({_id: state._id}, {$set: {
      status: failed ? 'ready-with-errors' : 'ready', completed_at: new Date(), last_success_at: new Date(),
      asset_count: assetCount, holder_count: holderCount, processed_assets: processed, failed_assets: failed
    }});
    console.log('Asset sync complete: ' + processed + ' processed, ' + failed + ' failed.');
  } catch (err) {
    await AssetSyncState.updateOne({_id: state._id}, {$set: {status: 'error', completed_at: new Date(), last_error: err.message}});
    throw err;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => { console.error(err.stack || err.message); process.exit(1); });
