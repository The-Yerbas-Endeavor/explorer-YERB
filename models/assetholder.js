'use strict';

const mongoose = require('mongoose');

const AssetHolderSchema = new mongoose.Schema({
  asset: {type: String, required: true, index: true},
  address: {type: String, required: true, index: true},
  balance: {type: String, required: true, default: '0'},
  balance_sort: {type: mongoose.Schema.Types.Decimal128, required: true, default: '0'},
  indexed_at: {type: Date, default: Date.now, index: true}
}, {collection: 'assetholders'});

AssetHolderSchema.index({asset: 1, address: 1}, {unique: true});
AssetHolderSchema.index({asset: 1, balance_sort: -1});
AssetHolderSchema.index({address: 1, asset: 1});

module.exports = mongoose.models.AssetHolder || mongoose.model('AssetHolder', AssetHolderSchema);
