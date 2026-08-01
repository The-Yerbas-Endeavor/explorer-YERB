var mongoose = require('mongoose'),
    Schema = mongoose.Schema;

var MasternodeSchema = new Schema({
  // Legacy fields
  rank: { type: Number, default: 0 },
  network: { type: String, default: '' },
  txhash: { type: String, default: '', index: true },
  outidx: { type: Number, default: 0 },
  status: { type: String, default: '' },
  addr: { type: String, default: '', index: true },
  version: { type: Number, default: 0 },
  lastseen: { type: Number, default: 0 },
  activetime: { type: Number, default: 0 },
  lastpaid: { type: Number, default: 0 },
  claim_name: { type: String, default: '', index: true },
  pose_penalty: { type: Number, default: 0 },
  pose_ban_height: { type: Number, default: -1 },

  // Deterministic Smartnode fields
  proTxHash: { type: String, default: '', index: true },

  collateralAddress: {
    type: String,
    default: '',
    index: true
  },

  collateralAmount: {
    type: Number,
    default: 0
  },

  payoutAddress: {
    type: String,
    default: '',
    index: true
  },

  ownerAddress: {
    type: String,
    default: ''
  },

  votingAddress: {
    type: String,
    default: ''
  },

  ip_address: {
    type: String,
    default: '',
    index: true
  },

  registeredHeight: {
    type: Number,
    default: 0
  },

  last_paid_block: {
    type: Number,
    default: 0
  },

  posePenalty: {
    type: Number,
    default: 0
  },

  poseBanHeight: {
    type: Number,
    default: -1
  },

  poseRevivedHeight: {
    type: Number,
    default: -1
  }
}, {
  id: false
});

module.exports = mongoose.model('Masternode', MasternodeSchema);