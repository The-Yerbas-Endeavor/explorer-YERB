'use strict';

var request = require('postman-request'),
    settings = require('./settings'),
    db = require('./database'),
    lib = require('./explorer');

var enabled = String(process.env.YERBAS_AI_ENABLED || '').toLowerCase() === 'true';
var baseUrl = String(process.env.YERBAS_AI_BASE_URL || '').replace(/\/+$/, '');
var model = String(process.env.YERBAS_AI_MODEL || '');
var apiKey = String(process.env.YERBAS_AI_API_KEY || '');
var maxQuestionLength = parseInt(process.env.YERBAS_AI_MAX_QUESTION_LENGTH || '500', 10);
var timeoutMs = parseInt(process.env.YERBAS_AI_TIMEOUT_MS || '12000', 10);

if (!Number.isFinite(maxQuestionLength) || maxQuestionLength < 32)
  maxQuestionLength = 500;

if (!Number.isFinite(timeoutMs) || timeoutMs < 1000)
  timeoutMs = 12000;

function providerEnabled() {
  return baseUrl !== '' && model !== '';
}

function safeNumber(value) {
  var n = Number(value);

  return Number.isFinite(n) ? n : null;
}

function gatherSnapshot(cb) {
  db.get_stats(settings.coin.name, function(stats) {
    lib.get_blockcount(function(blockcount) {
      db.get_masternodes(function(masternodes) {
        stats = stats || {};
        masternodes = Array.isArray(masternodes) ? masternodes : [];

        var collateralCounts = {};

        masternodes.forEach(function(mn) {
          var amount = safeNumber(mn.collateralAmount);

          if (amount != null) {
            var key = amount.toFixed(8);

            collateralCounts[key] = (collateralCounts[key] || 0) + 1;
          }
        });

        cb({
          coin: settings.coin.name,
          symbol: settings.coin.symbol || 'YERB',
          block_height: safeNumber(blockcount),
          supply: safeNumber(stats.supply),
          last_price: safeNumber(stats.last_price),
          last_usd_price: safeNumber(stats.last_usd_price),
          smartnodes_tracked: masternodes.length,
          smartnode_collateral_counts: collateralCounts,
          blockchain_last_updated: safeNumber(stats.blockchain_last_updated),
          masternodes_last_updated: safeNumber(stats.masternodes_last_updated),
          markets_last_updated: safeNumber(stats.markets_last_updated)
        });
      });
    });
  });
}

function transactionAnswer(txid, cb) {
  db.get_tx(txid, function(tx) {
    if (tx) {
      return cb({
        answer: 'Transaction ' + txid +
          ' is indexed in the explorer at block ' + tx.blockindex +
          '. It has ' + (Array.isArray(tx.vin) ? tx.vin.length : 0) +
          ' input(s), ' + (Array.isArray(tx.vout) ? tx.vout.length : 0) +
          ' output(s), and a recorded total of ' + tx.total + ' YERB.',
        sources: [{ type: 'transaction', id: txid, path: '/tx/' + txid }]
      });
    }

    lib.get_rawtransaction(txid, function(raw) {
      if (raw && raw.txid) {
        return cb({
          answer: 'Transaction ' + txid +
            ' was returned by the Yerbas node but is not currently indexed in the explorer database.' +
            (raw.confirmations != null ? ' Confirmations: ' + raw.confirmations + '.' : ''),
          sources: [{ type: 'transaction', id: txid, path: '/tx/' + txid }]
        });
      }

      cb({
        answer: 'I could not find transaction ' + txid + ' in the explorer database or through the read-only node lookup.',
        sources: []
      });
    });
  });
}

function localAnswer(question, cb) {
  var q = question.toLowerCase();
  var txMatch = question.match(/\b[a-fA-F0-9]{64}\b/);

  if (txMatch && /(tx|transaction|explain|find|lookup|look up)/i.test(question))
    return transactionAnswer(txMatch[0], cb);

  if (/(block height|current block|latest block|chain height|what block)/i.test(question)) {
    return lib.get_blockcount(function(blockcount) {
      cb({
        answer: 'The Yerbas network is currently at block ' + blockcount + '.',
        sources: [{ type: 'chain', id: 'block-height' }]
      });
    });
  }

  if (/(smartnode|masternode)/i.test(question)) {
    return db.get_masternodes(function(masternodes) {
      masternodes = Array.isArray(masternodes) ? masternodes : [];

      var collateralMatch =
        question.match(/(?:collateral(?: amount)?(?: of| is| =)?|with)\s*([\d,]+(?:\.\d+)?)/i) ||
        question.match(/([\d,]+(?:\.\d+)?)\s*YERB\s*(?:collateral)?/i);

      if (collateralMatch) {
        var target = Number(collateralMatch[1].replace(/,/g, ''));
        var count = masternodes.filter(function(mn) {
          return safeNumber(mn.collateralAmount) === target;
        }).length;

        return cb({
          answer: count + ' tracked Yerbas smartnode' + (count === 1 ? '' : 's') +
            ' currently have a collateralAmount of ' + target.toLocaleString('en-US') + ' YERB.',
          sources: [{ type: 'smartnodes', id: 'collateral-' + target, path: '/masternodes' }]
        });
      }

      cb({
        answer: 'The explorer currently tracks ' + masternodes.length + ' Yerbas smartnodes.',
        sources: [{ type: 'smartnodes', id: 'all', path: '/masternodes' }]
      });
    });
  }

  if (/(money supply|coin supply|circulating supply|current supply|how much yerb)/i.test(question)) {
    return db.get_stats(settings.coin.name, function(stats) {
      var supply = stats && stats.supply != null ? Number(stats.supply) : 0;

      cb({
        answer: 'The explorer currently reports a Yerbas supply of ' +
          supply.toLocaleString('en-US', { maximumFractionDigits: 8 }) + ' YERB.',
        sources: [{ type: 'stats', id: 'supply' }]
      });
    });
  }

  if (/(price|worth|usd|usdt)/i.test(question)) {
    return db.get_stats(settings.coin.name, function(stats) {
      stats = stats || {};

      var parts = [];

      if (stats.last_price != null)
        parts.push('default market price ' + stats.last_price);

      if (stats.last_usd_price != null)
        parts.push('USD estimate ' + stats.last_usd_price);

      cb({
        answer: parts.length > 0 ?
          'The explorer currently reports ' + parts.join(' and ') + '.' :
          'The explorer does not currently have a price value available.',
        sources: [{ type: 'stats', id: 'market-price', path: '/markets' }]
      });
    });
  }

  if (/(network status|chain status|status of yerbas|yerbas status|network summary)/i.test(question)) {
    return gatherSnapshot(function(snapshot) {
      cb({
        answer: 'Yerbas network summary: block ' + snapshot.block_height +
          ', supply ' + (snapshot.supply == null ? 'unavailable' : snapshot.supply.toLocaleString('en-US', { maximumFractionDigits: 8 }) + ' YERB') +
          ', ' + snapshot.smartnodes_tracked + ' smartnodes tracked' +
          (snapshot.last_usd_price == null ? '' : ', USD estimate ' + snapshot.last_usd_price) + '.',
        sources: [
          { type: 'chain', id: 'block-height' },
          { type: 'stats', id: 'supply' },
          { type: 'smartnodes', id: 'all', path: '/masternodes' }
        ]
      });
    });
  }

  cb(null);
}

function remoteAnswer(question, cb) {
  if (!providerEnabled()) {
    return cb(null, {
      code: 'no_provider',
      message: 'That question is outside the built-in read-only queries and no AI provider is configured yet.'
    });
  }

  gatherSnapshot(function(snapshot) {
    var headers = {
      'Content-Type': 'application/json'
    };

    if (apiKey !== '')
      headers.Authorization = 'Bearer ' + apiKey;

    request({
      method: 'POST',
      url: baseUrl + '/chat/completions',
      headers: headers,
      json: {
        model: model,
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content:
              'You are Ask Yerbas, a read-only assistant for the Yerbas cryptocurrency explorer. ' +
              'Use only the supplied chain snapshot for current chain facts. ' +
              'Do not claim that you can sign transactions, move funds, access private keys, or execute wallet actions. ' +
              'If the snapshot does not contain enough information, say what is missing instead of inventing it. ' +
              'Keep answers concise and distinguish live explorer data from general explanation.'
          },
          {
            role: 'user',
            content: 'Current read-only Yerbas snapshot:\n' +
              JSON.stringify(snapshot, null, 2) +
              '\n\nQuestion: ' + question
          }
        ]
      },
      timeout: timeoutMs
    }, function(err, response, body) {
      if (err) {
        return cb(null, {
          code: 'provider_error',
          message: 'The configured AI provider could not be reached.'
        });
      }

      if (!response || response.statusCode < 200 || response.statusCode >= 300) {
        return cb(null, {
          code: 'provider_error',
          message: 'The configured AI provider returned HTTP ' +
            (response ? response.statusCode : 'unknown') + '.'
        });
      }

      var answer = body && body.choices && body.choices[0] &&
        body.choices[0].message && body.choices[0].message.content;

      if (!answer) {
        return cb(null, {
          code: 'provider_error',
          message: 'The configured AI provider returned no answer.'
        });
      }

      cb({
        answer: String(answer).trim(),
        sources: [{ type: 'snapshot', id: 'current-explorer-state' }]
      }, null);
    });
  });
}

module.exports = {
  isEnabled: function() {
    return enabled;
  },

  isProviderEnabled: function() {
    return providerEnabled();
  },

  getStatus: function() {
    return {
      enabled: enabled,
      provider_enabled: providerEnabled(),
      model: providerEnabled() ? model : null,
      mode: providerEnabled() ? 'local+provider' : 'local'
    };
  },

  query: function(question, cb) {
    question = String(question || '').trim();

    if (!enabled) {
      return cb(null, {
        code: 'disabled',
        message: 'Ask Yerbas is disabled.'
      });
    }

    if (question === '') {
      return cb(null, {
        code: 'empty_question',
        message: 'Enter a question about Yerbas.'
      });
    }

    if (question.length > maxQuestionLength) {
      return cb(null, {
        code: 'question_too_long',
        message: 'Question exceeds the ' + maxQuestionLength + ' character limit.'
      });
    }

    localAnswer(question, function(local) {
      if (local) {
        local.mode = 'local';
        return cb(local, null);
      }

      remoteAnswer(question, function(remote, err) {
        if (err)
          return cb(null, err);

        remote.mode = 'provider';
        cb(remote, null);
      });
    });
  }
};
