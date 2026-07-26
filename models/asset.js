'use strict';

const mongoose = require('mongoose');

const AssetSchema = new mongoose.Schema({
  name: {type: String, required: true, unique: true, index: true},
  name_upper: {type: String, required: true, index: true},
  type: {type: String, required: true, index: true},
  amount: {type: String, default: '0'},
  units: {type: Number, default: 0},
  reissuable: {type: Boolean, default: false, index: true},
  has_ipfs: {type: Boolean, default: false, index: true},
  ipfs_hash: {type: String, default: ''},
  ipfs_url: {type: String, default: ''},
  issuer: [{type: String}],
  holder_count: {type: Number, default: 0, index: true},
  total_holder_balance: {type: String, default: '0'},
  indexed_at: {type: Date, default: Date.now, index: true},
  last_error: {type: String, default: ''}
}, {collection: 'assets'});

AssetSchema.index({name_upper: 'text'});

module.exports = mongoose.models.Asset || mongoose.model('Asset', AssetSchema);
