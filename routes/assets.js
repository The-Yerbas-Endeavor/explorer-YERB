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
  const message = err && err.message ? err.message : 'Unable to query Yerbas asset data.';
  res.status(status || 500).json({error: message});
}

function holderOptions(req) {
  return {
    page: req.query.page,
    perPage: req.query.per_page
  };
}

router.get('/assets', async (req, res) => {
  try {
    const data = await assets.listAssets({
      page: req.query.page,
      perPage: req.query.per_page,
      query: req.query.q,
      type: req.query.type
    });
    res.render('assets/index', renderOptions('assets', settings.coin.name + ' Assets', data));
  } catch (err) {
    res.status(503).render('assets/index', renderOptions('assets', settings.coin.name + ' Assets', {
      assets: [], total: 0, page: 1, pages: 1, perPage: 25,
      query: req.query.q || '', type: req.query.type || '', error: 'Asset RPC is unavailable. Confirm assetindex=1 and RPC access.'
    }));
  }
});

router.get('/asset/:name', async (req, res) => {
  try {
    const asset = await assets.getAsset(req.params.name, {page: 1, perPage: 10});
    if (!asset) return res.status(404).render('assets/detail', renderOptions('assets', 'Asset not found', {asset: null, error: 'Asset not found.'}));
    res.render('assets/detail', renderOptions('assets', asset.name + ' Asset', {asset}));
  } catch (err) {
    res.status(503).render('assets/detail', renderOptions('assets', 'Asset unavailable', {asset: null, error: 'Unable to retrieve this asset from Yerbas Core.'}));
  }
});

router.get('/asset/:name/holders', async (req, res) => {
  try {
    const asset = await assets.getAsset(req.params.name, holderOptions(req));
    if (!asset) return res.status(404).render('assets/holders', renderOptions('assets', 'Asset not found', {asset: null, error: 'Asset not found.'}));
    res.render('assets/holders', renderOptions('assets', asset.name + ' Holders', {asset}));
  } catch (err) {
    res.status(503).render('assets/holders', renderOptions('assets', 'Asset holders unavailable', {asset: null, error: 'Unable to retrieve holder data from Yerbas Core.'}));
  }
});

router.get('/address/:address/assets', async (req, res) => {
  try {
    const balances = await assets.getAddressAssets(req.params.address);
    res.render('assets/holder', renderOptions('assets', req.params.address + ' Assets', {address: req.params.address, balances}));
  } catch (err) {
    res.status(503).render('assets/holder', renderOptions('assets', 'Address assets unavailable', {address: req.params.address, balances: {}, error: 'Unable to retrieve asset balances for this address.'}));
  }
});

router.get('/ext/assets', async (req, res) => {
  try {
    res.json(await assets.listAssets({page: req.query.page, perPage: req.query.per_page, query: req.query.q, type: req.query.type}));
  } catch (err) { sendError(res, err, 503); }
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
      totalBalance: asset.total_holder_balance,
      holders: asset.holder_entries
    });
  } catch (err) { sendError(res, err, 503); }
});

router.get('/ext/address/:address/assets', async (req, res) => {
  try {
    res.json({address: req.params.address, assets: await assets.getAddressAssets(req.params.address)});
  } catch (err) { sendError(res, err, 503); }
});

module.exports = router;