'use strict';

const settings = require('./settings');
const Node = require('./node');
const client = new Node.Client(settings.wallet);

function rpc(method, params) {
  return new Promise((resolve, reject) => {
    client.cmd(method, ...(params || []), (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

function inferType(name) {
  if (name.endsWith('!')) return 'Owner';
  if (name.startsWith('$')) return 'Restricted';
  if (name.startsWith('#')) return 'Qualifier';
  if (name.includes('#')) return 'Unique';
  if (name.includes('/')) return 'Sub-asset';
  return 'Root';
}

function normalizeAsset(name, metadata) {
  const data = metadata && typeof metadata === 'object' ? metadata : {};
  return {
    name,
    amount: data.amount == null ? 0 : data.amount,
    units: data.units == null ? 0 : Number(data.units),
    reissuable: Boolean(data.reissuable),
    has_ipfs: Boolean(data.has_ipfs || data.ipfs_hash),
    ipfs_hash: data.ipfs_hash || '',
    type: data.type || inferType(name)
  };
}

async function listAssets(options) {
  const opts = options || {};
  const page = Math.max(1, Number(opts.page) || 1);
  const perPage = Math.max(10, Math.min(100, Number(opts.perPage) || 25));
  const query = String(opts.query || '').trim().toUpperCase();
  const type = String(opts.type || '').trim().toLowerCase();
  const raw = await rpc('listassets', []);
  const names = Array.isArray(raw) ? raw : Object.keys(raw || {});
  const filtered = names
    .filter((name) => !query || name.toUpperCase().includes(query))
    .filter((name) => !type || inferType(name).toLowerCase() === type)
    .sort((a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'}));
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const currentPage = Math.min(page, pages);
  const selected = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);
  const assets = await Promise.all(selected.map(async (name) => {
    try {
      return normalizeAsset(name, await rpc('getassetdata', [name]));
    } catch (err) {
      return normalizeAsset(name, null);
    }
  }));
  return {assets, total, page: currentPage, pages, perPage, query, type};
}

async function getAsset(name) {
  const metadata = await rpc('getassetdata', [name]);
  if (!metadata || typeof metadata !== 'object') return null;
  const asset = normalizeAsset(name, metadata);
  const holders = await rpc('listaddressesbyasset', [name]);
  asset.holders = holders && typeof holders === 'object' ? holders : {};
  asset.holder_count = Object.keys(asset.holders).length;
  const ownerAddresses = await rpc('listaddressesbyasset', [name + '!']).catch(() => ({}));
  asset.issuer = ownerAddresses && typeof ownerAddresses === 'object' ? Object.keys(ownerAddresses) : [];
  return asset;
}

async function getAddressAssets(address) {
  const balances = await rpc('listassetbalancesbyaddress', [address]);
  return balances && typeof balances === 'object' ? balances : {};
}

module.exports = {rpc, inferType, listAssets, getAsset, getAddressAssets};
