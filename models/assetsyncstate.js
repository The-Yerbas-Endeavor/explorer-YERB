'use strict';

const mongoose = require('mongoose');

const AssetSyncStateSchema = new mongoose.Schema({
  key: {type: String, required: true, unique: true, default: 'assets'},
  status: {type: String, default: 'idle', index: true},
  started_at: {type: Date, default: null},
  completed_at: {type: Date, default: null},
  last_success_at: {type: Date, default: null},
  last_error: {type: String, default: ''},
  asset_count: {type: Number, default: 0},
  holder_count: {type: Number, default: 0},
  processed_assets: {type: Number, default: 0},
  failed_assets: {type: Number, default: 0},
  indexer_version: {type: String, default: '1'}
}, {collection: 'assetsyncstates'});

module.exports = mongoose.models.AssetSyncState || mongoose.model('AssetSyncState', AssetSyncStateSchema);
