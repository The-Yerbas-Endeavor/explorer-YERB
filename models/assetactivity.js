'use strict';

const mongoose = require('mongoose');

const AssetActivitySchema = new mongoose.Schema({
  asset: {type: String, required: true, index: true},
  txid: {type: String, required: true, index: true},
  blockindex: {type: Number, default: -1, index: true},
  timestamp: {type: Number, default: 0, index: true},
  type: {type: String, required: true, index: true},
  address: {type: String, default: '', index: true},
  amount: {type: String, default: '0'},
  metadata: {type: mongoose.Schema.Types.Mixed, default: {}}
}, {collection: 'assetactivities'});

AssetActivitySchema.index({asset: 1, txid: 1, type: 1, address: 1}, {unique: true});

module.exports = mongoose.models.AssetActivity || mongoose.model('AssetActivity', AssetActivitySchema);
