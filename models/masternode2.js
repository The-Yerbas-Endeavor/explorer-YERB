var mongoose = require('mongoose'),
    Schema = mongoose.Schema;

var MasternodeSchema = new Schema({
  rank: { type: Number, default: 0 },
  network: { type: String, default: "" },
  txhash: { type: String, default: "" },
  outidx: { type: Number, default: 0 },
  status: { type: String, default: "" },
  addr: { type: String, index: true },
  version: { type: Number, default: 0 },
  lastseen: { type: Number, default: 0 },
  activetime: { type: Number, default: 0 },
  lastpaid: { type: Number, default: 0 },
  claim_name: { type: String, default: '', index: true },
  ip_address: { type: String, default: '', index: true },
  last_paid_block: { type: Number, default: 0 },

  // Normalized explorer fields.
  pose_penalty: { type: Number, default: 0 },
  pose_ban_height: { type: Number, default: -1 },
  pose_revived_height: { type: Number, default: -1 },

  // Preserve PoSe values returned by different Yerbas/Dash RPC versions.
  posePenalty: { type: Number, default: 0 },
  PoSePenalty: { type: Number, default: 0 },
  poseBanHeight: { type: Number, default: -1 },
  PoSeBanHeight: { type: Number, default: -1 },
  poseRevivedHeight: { type: Number, default: -1 },
  PoSeRevivedHeight: { type: Number, default: -1 }
}, {id: false});

module.exports = mongoose.model('Masternode', MasternodeSchema);
