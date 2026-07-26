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
  const text = value == null || value === '' ? '0' : String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) throw new Error('Invalid decimal value: ' + text);
  return text;
}

function addDecimals(left, right) {
  const a = decimalString(left);
  const b = decimalString(right);
  const ad = (a.split('.')[1] || '').length;
  const bd = (b.split('.')[1] || '').length;
  const scale = Math.max(ad, bd);
  const toInteger = (value, decimals) => {
    const negative = value.startsWith('-');
    const unsigned = negative ? value.slice(1) : value;
    const parts = unsigned.split('.');
    const digits = parts[0] + (parts[1] || '').padEnd(scale, '0');
    const integer = BigInt(digits || '0');
    return negative ? -integer : integer;
  };
  const sum = toInteger(a, ad) + toInteger(b, bd);
  const negative = sum < 0n;
  const digits = (negative ? -sum : sum).toString().padStart(scale + 1, '0');
  if (scale === 0) return (negative ? '-' : '') + digits;
  const whole = digits.slice(0, -scale) || '0';
  const fraction = digits.slice(-scale).replace(/0+$/, '');
  return (negative ? '-' : '') + whole + (fraction ? '.' + fraction : '');
}

async function mapLimit(items, limit, worker) {
  let cursor = 0;
  const runners = Array.from({length: Math.min(limit, items.length || 1)}, async () => {
    while (cursor < items.length) await worker(items[cursor], cursor++);
  });
  await Promise.all(runners);
}

async function indexOne(name) {
  const metadata = await assetRpc.rpc('getassetdata', [name]);
  const normalized = assetRpc.normalizeAsset(name, metadata);
  const holdersRaw = await assetRpc.rpc('listaddressesbyasset', [name]).catch(() => ({}));
  const holders = Object.entries(holdersRaw && typeof holdersRaw === 'object' ? holdersRaw : {})
    .map(([address, balance]) => [address, decimalString(balance)])
    .filter((entry) => entry[1] !== '0');
  const issuerRaw = await assetRpc.rpc('listaddressesbyasset', [name + '!']).catch(() => ({}));
  const issuer = issuerRaw && typeof issuerRaw === 'object' ? Object.keys(issuerRaw) : [];
  const total = holders.reduce((sum, entry) => addDecimals(sum, entry[1]), '0');

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
    total_holder_balance: total,
    indexed_at: new Date(),
    last_error: ''
  }}, {upsert: true});

  const now = new Date();
  if (holders.length) {
    await AssetHolder.bulkWrite(holders.map(([address, balance]) => ({
      updateOne: {
        filter: {asset: name, address},
        update: {$set: {asset: name, address, balance, balance_sort: mongoose.Types.Decimal128.fromString(balance), indexed_at: now}},
        upsert: true
      }
    })), {ordered: false});
  }
  await AssetHolder.deleteMany({asset: name, address: {$nin: holders.map((entry) => entry[0])}});
}

async function main() {
  if (!['update', 'reindex', 'asset'].includes(mode)) throw new Error('Usage: node scripts/sync-assets.js [update|reindex|asset NAME]');
  await mongoose.connect(mongoUri());
  const state = await AssetSyncState.findOneAndUpdate({key: 'assets'}, {$set: {
    status: 'running', started_at: new Date(), completed_at: null, last_error: '', processed_assets: 0, failed_assets: 0
  }}, {upsert: true, new: true});

  try {
    if (mode === 'reindex') await Promise.all([Asset.deleteMany({}), AssetHolder.deleteMany({})]);
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
