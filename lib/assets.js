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

function ipfsUrl(hash) {
  if (!hash) return '';
  return 'https://ipfs.io/ipfs/' + encodeURIComponent(hash);
}

function normalizeAsset(name, metadata) {
  const data = metadata && typeof metadata === 'object' ? metadata : {};
  const hash = data.ipfs_hash || '';
  return {
    name,
    amount: data.amount == null ? 0 : data.amount,
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

async function listAssets(options) {
  const opts = options || {};
  const page = Math.max(1, Number(opts.page) || 1);
  const perPage = pagination(opts.perPage, 25, 10, 100);
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

async function getAsset(name, options) {
  const opts = options || {};
  const metadata = await rpc('getassetdata', [name]);
  if (!metadata || typeof metadata !== 'object') return null;

  const asset = normalizeAsset(name, metadata);
  const holders = await rpc('listaddressesbyasset', [name]);
  asset.holders = holders && typeof holders === 'object' ? holders : {};

  const holderEntries = Object.entries(asset.holders)
    .map(([address, balance]) => ({address, balance: Number(balance) || 0}))
    .sort((a, b) => b.balance - a.balance || a.address.localeCompare(b.address));

  asset.holder_count = holderEntries.length;
  asset.total_holder_balance = holderEntries.reduce((sum, holder) => sum + holder.balance, 0);
  asset.holder_per_page = pagination(opts.perPage, 50, 10, 250);
  asset.holder_pages = Math.max(1, Math.ceil(asset.holder_count / asset.holder_per_page));
  asset.holder_page = Math.min(Math.max(1, Number(opts.page) || 1), asset.holder_pages);
  const start = (asset.holder_page - 1) * asset.holder_per_page;
  asset.holder_entries = holderEntries.slice(start, start + asset.holder_per_page).map((holder) => ({
    address: holder.address,
    balance: holder.balance,
    percentage: asset.total_holder_balance > 0 ? (holder.balance / asset.total_holder_balance) * 100 : 0
  }));

  const ownerAddresses = await rpc('listaddressesbyasset', [name + '!']).catch(() => ({}));
  asset.issuer = ownerAddresses && typeof ownerAddresses === 'object' ? Object.keys(ownerAddresses) : [];
  return asset;
}

async function getAddressAssets(address) {
  const balances = await rpc('listassetbalancesbyaddress', [address]);
  return balances && typeof balances === 'object' ? balances : {};
}

module.exports = {rpc, inferType, ipfsUrl, listAssets, getAsset, getAddressAssets};
