'use strict';

const express = require('express');
const settings = require('../lib/settings');
const db = require('../lib/database');
const assets = require('../lib/assets');

const router = express.Router();

function renderOptions(active, title, extra) {
  return Object.assign({
    active,
    showSync: db.check_show_sync_message(),
    styleHash: null,
    themeHash: null,
    page_title_prefix: title
  }, extra || {});
}

function sendError(res, err, status) {
  const message = err && err.message ? err.message : 'Asset information is temporarily unavailable.';
  res.status(status || 500).json({error: message});
}

function holderOptions(req) {
  return {page: req.query.page, perPage: req.query.per_page};
}

function listOptions(req) {
  return {
    page: req.query.page,
    perPage: req.query.per_page,
    query: req.query.q,
    type: req.query.type,
    sort: req.query.sort,
    reissuable: req.query.reissuable,
    hasMetadata: req.query.has_metadata
  };
}

router.post('/search', async (req, res, next) => {
  const query = String(req.body && req.body.search || '').trim();
  if (!query || query.length === 64 || /^\d+$/.test(query)) return next();
  try {
    const matches = await assets.searchAssets(query, 10);
    const exact = matches.find((asset) => asset.name && asset.name.toUpperCase() === query.toUpperCase());
    if (exact) return res.redirect('/asset/' + encodeURIComponent(exact.name));
    return next();
  } catch (err) {
    return next();
  }
});

router.get('/assets', async (req, res) => {
  try {
    const data = await assets.listAssets(listOptions(req));
    data.has_metadata = req.query.has_metadata || '';
    data.reissuable = req.query.reissuable || '';
    data.syncStatus = await assets.getStatus();
    res.render('assets/index', renderOptions('assets', settings.coin.name + ' Assets', data));
  } catch (err) {
    res.status(503).render('assets/index', renderOptions('assets', settings.coin.name + ' Assets', {
      assets: [], total: 0, page: 1, pages: 1, perPage: 25,
      query: req.query.q || '', type: req.query.type || '', sort: req.query.sort || 'name', has_metadata: '', reissuable: '',
      syncStatus: {status: 'error', last_error: err.message},
      error: 'Asset information is temporarily unavailable. The standard block explorer remains online.'
    }));
  }
});

router.get('/asset/:name', async (req, res) => {
  try {
    const asset = await assets.getAsset(req.params.name, {page: 1, perPage: 10});
    if (!asset) return res.status(404).render('assets/detail', renderOptions('assets', 'Asset not found', {asset: null, error: 'Asset not found.'}));
    const activity = await assets.getActivity(req.params.name, 1, 10);
    res.render('assets/detail', renderOptions('assets', asset.name + ' Asset', {asset, activity}));
  } catch (err) {
    res.status(503).render('assets/detail', renderOptions('assets', 'Asset unavailable', {asset: null, error: 'Unable to retrieve this asset.'}));
  }
});

router.get('/asset/:name/holders', async (req, res) => {
  try {
    const asset = await assets.getAsset(req.params.name, holderOptions(req));
    if (!asset) return res.status(404).render('assets/holders', renderOptions('assets', 'Asset not found', {asset: null, error: 'Asset not found.'}));
    res.render('assets/holders', renderOptions('assets', asset.name + ' Holders', {asset}));
  } catch (err) {
    res.status(503).render('assets/holders', renderOptions('assets', 'Asset holders unavailable', {asset: null, error: 'Unable to retrieve holder data.'}));
  }
});

router.get('/asset/:name/activity', async (req, res) => {
  try {
    const asset = await assets.getAsset(req.params.name, {page: 1, perPage: 10});
    if (!asset) return res.status(404).json({error: 'Asset not found.'});
    res.json(Object.assign({asset: asset.name}, await assets.getActivity(asset.name, req.query.page, req.query.per_page)));
  } catch (err) { sendError(res, err, 503); }
});

router.get('/address/:address/assets', async (req, res) => {
  try {
    const balances = await assets.getAddressAssets(req.params.address);
    res.render('assets/holder', renderOptions('assets', req.params.address + ' Assets', {address: req.params.address, balances}));
  } catch (err) {
    res.status(503).render('assets/holder', renderOptions('assets', 'Address assets unavailable', {address: req.params.address, balances: [], error: 'Unable to retrieve asset balances for this address.'}));
  }
});

router.get('/ext/assets', async (req, res) => {
  try { res.json(await assets.listAssets(listOptions(req))); }
  catch (err) { sendError(res, err, 503); }
});

router.get('/ext/assets/status', async (req, res) => {
  try { res.json(await assets.getStatus()); }
  catch (err) { sendError(res, err, 503); }
});

router.get('/ext/assets/search', async (req, res) => {
  try { res.json({query: req.query.q || '', assets: await assets.searchAssets(req.query.q, req.query.limit)}); }
  catch (err) { sendError(res, err, 503); }
});

router.get('/ext/asset/:name', async (req, res) => {
  try {
    const asset = await assets.getAsset(req.params.name, holderOptions(req));
    if (!asset) return res.status(404).json({error: 'Asset not found.'});
    res.json(asset);
  } catch (err) { sendError(res, err, 503); }
});

router.get('/ext/asset/:name/holders', async (req, res) => {
  try {
    const asset = await assets.getAsset(req.params.name, holderOptions(req));
    if (!asset) return res.status(404).json({error: 'Asset not found.'});
    res.json({
      asset: asset.name,
      total: asset.holder_count,
      page: asset.holder_page,
      pages: asset.holder_pages,
      perPage: asset.holder_per_page,
      totalBalance: asset.total_holder_balance || '0',
      holders: asset.holder_entries
    });
  } catch (err) { sendError(res, err, 503); }
});

router.get('/ext/asset/:name/activity', async (req, res) => {
  try { res.json(Object.assign({asset: req.params.name}, await assets.getActivity(req.params.name, req.query.page, req.query.per_page))); }
  catch (err) { sendError(res, err, 503); }
});

router.get('/ext/address/:address/assets', async (req, res) => {
  try { res.json({address: req.params.address, assets: await assets.getAddressAssets(req.params.address)}); }
  catch (err) { sendError(res, err, 503); }
});

module.exports = router;
