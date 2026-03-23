const request = require('postman-request');
const base_url = 'https://api.exbitron.com/api/v1';
const market_url_template = 'https://app.exbitron.com/trade/{coin}_{base}';

const rateLimitLib = require('../ratelimit');
const rateLimit = new rateLimitLib.RateLimit(1, 2000, false);

function buildPair(coin, exchange) {
  return (coin + '_' + exchange).toUpperCase();
}

function reqJson(url, cb) {
  rateLimit.schedule(function() {
    request({
      uri: url,
      json: true,
      timeout: 10000,
      headers: {
        'User-Agent': 'Yerbas-Iquidus/1.0',
        'Accept': 'application/json'
      }
    }, function(error, response, body) {
      if (error) return cb(error, null);
      return cb(null, body);
    });
  });
}

// SUMMARY
function get_summary(coin, exchange, api_error_msg, cb) {
  const pair = buildPair(coin, exchange);

  reqJson(base_url + '/cmc/summary', function(error, body) {
    if (error) return cb(error, null);
    if (!body) return cb(api_error_msg || 'Exbitron summary error', null);

    try {
      const rows = Array.isArray(body) ? body :
        (Array.isArray(body.data) ? body.data : []);

      const t = rows.find(function(row) {
        return String(row.trading_pairs || '').toUpperCase() === pair;
      });

      if (!t) {
        return cb('Exbitron pair not found: ' + pair, null);
      }

      return cb(null, {
        high: parseFloat(t.highest_price_24h) || 0,
        low: parseFloat(t.lowest_price_24h) || 0,
        volume: parseFloat(t.base_volume) || 0,
        volume_btc: parseFloat(t.quote_volume) || 0,
        bid: parseFloat(t.highest_bid) || 0,
        ask: parseFloat(t.lowest_ask) || 0,
        last: parseFloat(t.last_price) || 0,
        prev: 0,
        change: parseFloat(t.price_change_percent_24h) || 0
      });
    } catch (e) {
      return cb(e, null);
    }
  });
}

// ORDERBOOK
function get_orders(coin, exchange, api_error_msg, cb) {
  const pair = buildPair(coin, exchange);

  reqJson(base_url + '/cmc/orderbook?market_pair=' + pair + '&level=2', function(error, body) {
    if (error || !body) return cb(null, [], []);

    try {
      const bids = Array.isArray(body.bids) ? body.bids : [];
      const asks = Array.isArray(body.asks) ? body.asks : [];

      const buys = bids.map(function(row) {
        return {
          price: parseFloat(row[0] || row.price) || 0,
          quantity: parseFloat(row[1] || row.quantity) || 0
        };
      });

      const sells = asks.map(function(row) {
        return {
          price: parseFloat(row[0] || row.price) || 0,
          quantity: parseFloat(row[1] || row.quantity) || 0
        };
      });

      return cb(null, buys, sells);
    } catch (e) {
      return cb(null, [], []);
    }
  });
}

// TRADES
function get_trades(coin, exchange, api_error_msg, cb) {
  const pair = buildPair(coin, exchange);

  reqJson(base_url + '/cmc/trades?market_pair=' + pair, function(error, body) {
    if (error || !body) return cb(null, []);

    try {
      const rows = Array.isArray(body.data)
        ? body.data
        : (Array.isArray(body) ? body : []);

      const trades = rows.map(function(row) {
        let ts = row.timestamp || row.time || row.created_at || Date.now();

        if (ts > 1000000000000) {
          ts = Math.floor(ts / 1000);
        }

        return {
          ordertype: String(row.type || row.side || 'buy').toLowerCase(),
          price: parseFloat(row.price) || 0,
          quantity: parseFloat(row.base_volume || row.amount || row.quantity) || 0,
          timestamp: parseInt(ts) || Math.floor(Date.now() / 1000)
        };
      });

      return cb(null, trades);
    } catch (e) {
      return cb(null, []);
    }
  });
}

module.exports = {
  market_name: 'Exbitron',
  market_logo: 'https://app.exbitron.com/favicon.ico',
  market_url_template: market_url_template,
  market_url_case: 'u',

  get_data: function(settings, cb) {
    get_summary(settings.coin, settings.exchange, settings.api_error_msg, function(summary_error, stats) {
      if (summary_error || !stats) {
        return cb(summary_error || 'Exbitron summary error', null);
      }

      return cb(null, {
        buys: [],
        sells: [],
        trades: [],
        stats: {
          last: stats.last || 0,
          bid: 0,
          ask: 0,
          high: 0,
          low: 0,
          volume: 0,
          volume_btc: 0,
          prev: 0,
          change: 0
        },
        chartdata: []
      });
    });
  }
};