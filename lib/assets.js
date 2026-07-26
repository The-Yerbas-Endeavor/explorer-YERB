'use strict';

const mongoose = require('mongoose');
const settings = require('./settings');
const Node = require('./node');
const Asset = require('../models/asset');
const AssetHolder = require('../models/assetholder');
const AssetActivity = require('../models/assetactivity');
const AssetSyncState = require('../models/assetsyncstate');
const client = new Node.Client(settings.wallet);
const cache = new Map();

function rpc(method, params) {
  return new Promise((resolve, reject) => {
    client.cmd(method, ...(params || []), (err, result) => err ? reject(err) : resolve(result));
  });
}

async function cached(key, ttlMs, loader) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await loader();
  cache.set(key, {value, expires: Date.now() + ttlMs});
  return value;
}

function inferType(name) {
  if (name.endsWith('!')) return 'Owner';
  if (name.startsWith('$')) return 'Restricted';
  if (name.startsWith('#')) return 'Qualifier';
  if (name.includes('#')) return 'Unique';
  if (name.includes('/')) return 'Sub-asset';
  return 'Root';
}

function ipfsUrl(hash) {
  return hash ? 'https://ipfs.io/ipfs/' + encodeURIComponent(hash) : '';
}

function normalizeAsset(name, metadata) {
  const data = metadata && typeof metadata === 'object' ? metadata : {};
  const hash = data.ipfs_hash || '';
  return {
    name,
    amount: data.amount == null ? '0' : String(data.amount),
    units: data.units == null ? 0 : Number(data.units),
    reissuable: Boolean(data.reissuable),
    has_ipfs: Boolean(data.has_ipfs || hash),
    ipfs_hash: hash,
    ipfs_url: ipfsUrl(hash),
    type: data.type || inferType(name)
  };
}

function pagination(value, fallback, min, max) {
  return Math.max(min, Math.min(max, Number(value) || fallback));
}

function connected() {
  return mongoose.connection.readyState === 1;
}

function clean(doc) {
  if (!doc) return null;
  const value = doc.toObject ? doc.toObject() : Object.assign({}, doc);
  delete value._id;
  delete value.__v;
  return value;
}

async function listAssets(options) {
  const opts = options || {};
  const page = Math.max(1, Number(opts.page) || 1);
  const perPage = pagination(opts.perPage, 25, 10, 100);
  const query = String(opts.query || '').trim();
  const type = String(opts.type || '').trim();
  const sort = ['name', 'supply', 'holders', 'updated'].includes(opts.sort) ? opts.sort : 'name';

  if (connected() && await Asset.estimatedDocumentCount() > 0) {
    const filter = {};
    if (query) filter.name_upper = {$regex: query.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')};
    if (type) filter.type = new RegExp('^' + type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
    if (opts.reissuable === 'true' || opts.reissuable === 'false') filter.reissuable = opts.reissuable === 'true';
    if (opts.hasMetadata === 'true' || opts.hasMetadata === 'false') filter.has_ipfs = opts.hasMetadata === 'true';
    const sortSpec = sort === 'holders' ? {holder_count: -1, name: 1} : sort === 'updated' ? {indexed_at: -1, name: 1} : {name: 1};
    const total = await Asset.countDocuments(filter);
    const pages = Math.max(1, Math.ceil(total / perPage));
    const currentPage = Math.min(page, pages);
    const docs = await Asset.find(filter).sort(sortSpec).skip((currentPage - 1) * perPage).limit(perPage).lean();
    return {assets: docs.map(clean), total, page: currentPage, pages, perPage, query, type, sort, source: 'index'};
  }

  return cached('rpc:list:' + JSON.stringify({page, perPage, query, type}), 60000, async () => {
    const raw = await rpc('listassets', []);
    const names = (Array.isArray(raw) ? raw : Object.keys(raw || {}))
      .filter((name) => !query || name.toUpperCase().includes(query.toUpperCase()))
      .filter((name) => !type || inferType(name).toLowerCase() === type.toLowerCase())
      .sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'}));
    const total = names.length;
    const pages = Math.max(1, Math.ceil(total / perPage));
    const currentPage = Math.min(page, pages);
    const selected = names.slice((currentPage - 1) * perPage, currentPage * perPage);
    const result = await Promise.all(selected.map(async (name) => normalizeAsset(name, await rpc('getassetdata', [name]).catch(() => null))));
    return {assets: result, total, page: currentPage, pages, perPage, query, type, sort, source: 'rpc'};
  });
}

async function getAsset(name, options) {
  const opts = options || {};
  const perPage = pagination(opts.perPage, 50, 10, 250);
  if (connected()) {
    const doc = await Asset.findOne({name}).lean();
    if (doc) {
      const total = await AssetHolder.countDocuments({asset: name});
      const pages = Math.max(1, Math.ceil(total / perPage));
      const page = Math.min(Math.max(1, Number(opts.page) || 1), pages);
      const holders = await AssetHolder.find({asset: name}).sort({balance_sort: -1, address: 1}).skip((page - 1) * perPage).limit(perPage).lean();
      const asset = clean(doc);
      asset.holder_count = total;
      asset.holder_page = page;
      asset.holder_pages = pages;
      asset.holder_per_page = perPage;
      asset.holder_entries = holders.map((holder) => ({address: holder.address, balance: holder.balance}));
      return asset;
    }
  }

  return cached('rpc:asset:' + name + ':' + perPage + ':' + (opts.page || 1), 300000, async () => {
    const metadata = await rpc('getassetdata', [name]);
    if (!metadata || typeof metadata !== 'object') return null;
    const asset = normalizeAsset(name, metadata);
    const raw = await rpc('listaddressesbyasset', [name]);
    const entries = Object.entries(raw && typeof raw === 'object' ? raw : {}).filter((entry) => String(entry[1]) !== '0');
    entries.sort((a, b) => Number(b[1]) - Number(a[1]) || a[0].localeCompare(b[0]));
    asset.holder_count = entries.length;
    asset.holder_per_page = perPage;
    asset.holder_pages = Math.max(1, Math.ceil(entries.length / perPage));
    asset.holder_page = Math.min(Math.max(1, Number(opts.page) || 1), asset.holder_pages);
    asset.holder_entries = entries.slice((asset.holder_page - 1) * perPage, asset.holder_page * perPage).map(([address, balance]) => ({address, balance: String(balance)}));
    const owners = await rpc('listaddressesbyasset', [name + '!']).catch(() => ({}));
    asset.issuer = owners && typeof owners === 'object' ? Object.keys(owners) : [];
    return asset;
  });
}

async function getAddressAssets(address) {
  if (connected() && await AssetHolder.countDocuments({address}) > 0) {
    const holders = await AssetHolder.find({address}).sort({asset: 1}).lean();
    const names = holders.map((holder) => holder.asset);
    const metadata = await Asset.find({name: {$in: names}}).lean();
    const byName = new Map(metadata.map((asset) => [asset.name, asset]));
    return holders.map((holder) => ({asset: holder.asset, balance: holder.balance, metadata: clean(byName.get(holder.asset))}));
  }
  const balances = await cached('rpc:address:' + address, 60000, () => rpc('listassetbalancesbyaddress', [address]));
  return Object.entries(balances && typeof balances === 'object' ? balances : {}).map(([asset, balance]) => ({asset, balance: String(balance)}));
}

async function getStatus() {
  const state = connected() ? await AssetSyncState.findOne({key: 'assets'}).lean() : null;
  return state ? clean(state) : {status: 'rpc-only', asset_count: 0, holder_count: 0, last_error: '', indexer_version: '1'};
}

async function searchAssets(query, limit) {
  const q = String(query || '').trim();
  const max = pagination(limit, 20, 1, 50);
  if (!q) return [];
  if (connected()) return Asset.find({name_upper: {$regex: q.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}}).sort({name: 1}).limit(max).lean();
  const result = await listAssets({query: q, perPage: max});
  return result.assets;
}

async function getActivity(name, pageValue, perPageValue) {
  const page = Math.max(1, Number(pageValue) || 1);
  const perPage = pagination(perPageValue, 50, 10, 100);
  if (!connected()) return {activity: [], total: 0, page, pages: 1, perPage};
  const total = await AssetActivity.countDocuments({asset: name});
  const pages = Math.max(1, Math.ceil(total / perPage));
  const activity = await AssetActivity.find({asset: name}).sort({blockindex: -1, timestamp: -1}).skip((page - 1) * perPage).limit(perPage).lean();
  return {activity: activity.map(clean), total, page: Math.min(page, pages), pages, perPage};
}

module.exports = {rpc, cached, inferType, ipfsUrl, normalizeAsset, listAssets, getAsset, getAddressAssets, getStatus, searchAssets, getActivity};
