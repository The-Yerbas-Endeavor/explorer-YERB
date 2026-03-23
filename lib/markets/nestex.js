const https = require('https');
const market_url_template = 'https://trade.nestex.one/spot/{coin}_{base}';

function buildPair(coin, exchange) {
  return (coin + '_' + exchange).toUpperCase();
}

function fetchJson(url, cb) {
  const req = https.get(url, {
    headers: {
      'User-Agent': 'Yerbas-Iquidus/1.0',
      'Accept': 'application/json'
    }
  }, function(res) {
    let data = '';

    res.on('data', function(chunk) {
      data += chunk;
    });

    res.on('end', function() {
      try {
        const json = JSON.parse(data);
        return cb(null, json);
      } catch (e) {
        return cb(e, null);
      }
    });
  });

  req.on('error', function(err) {
    return cb(err, null);
  });

  req.setTimeout(10000, function() {
    req.destroy(new Error('Request timed out'));
  });
}

function get_summary(coin, exchange, api_error_msg, cb) {
  const pair = buildPair(coin, exchange);
  const url = 'https://trade.nestex.one/api/cg/tickers/' + pair;

  fetchJson(url, function(error, body) {
    if (error) return cb(error, null);
    if (!body || typeof body !== 'object') return cb(api_error_msg, null);

    return cb(null, {
      high: parseFloat(body.high) || 0,
      low: parseFloat(body.low) || 0,
      volume: parseFloat(body.base_volume) || 0,
      volume_btc: parseFloat(body.target_volume) || 0,
      bid: parseFloat(body.bid) || 0,
      ask: parseFloat(body.ask) || 0,
      last: parseFloat(body.last_price) || 0,
      prev: 0,
      change: 0
    });
  });
}

function get_orders(coin, exchange, api_error_msg, cb) {
  const pair = buildPair(coin, exchange);
  const url = 'https://trade.nestex.one/api/cg/orderbook/' + pair + '?depth=100';

  fetchJson(url, function(error, body) {
    if (error || !body) return cb(null, [], []);

    try {
      let buys = [];
      let sells = [];

      if (Array.isArray(body.bids)) {
        buys = body.bids.map(function(row) {
          return {
            price: parseFloat(row[0]) || 0,
            quantity: parseFloat(row[1]) || 0
          };
        });
      } else if (body.bids && typeof body.bids === 'object') {
        buys = Object.keys(body.bids).map(function(price) {
          return {
            price: parseFloat(price) || 0,
            quantity: parseFloat(body.bids[price]) || 0
          };
        });
      }

      if (Array.isArray(body.asks)) {
        sells = body.asks.map(function(row) {
          return {
            price: parseFloat(row[0]) || 0,
            quantity: parseFloat(row[1]) || 0
          };
        });
      } else if (body.asks && typeof body.asks === 'object') {
        sells = Object.keys(body.asks).map(function(price) {
          return {
            price: parseFloat(price) || 0,
            quantity: parseFloat(body.asks[price]) || 0
          };
        });
      }

      return cb(null, buys, sells);
    } catch (e) {
      return cb(null, [], []);
    }
  });
}

function get_trades(coin, exchange, api_error_msg, cb) {
  const pair = buildPair(coin, exchange);
  const url = 'https://trade.nestex.one/api/cg/tradebook/' + pair + '?page=1';

  fetchJson(url, function(error, body) {
    if (error || !body) return cb(null, []);

    try {
      const rows = Array.isArray(body.data) ? body.data : [];
      const trades = rows.map(function(row) {
        let ts = row.timestamp || row.time || Date.now();

        if (ts > 1000000000000) {
          ts = Math.floor(ts / 1000);
        }

        return {
          ordertype: String(row.side || row.type || 'buy').toLowerCase(),
          price: parseFloat(row.price) || 0,
          quantity: parseFloat(row.quantity || row.amount) || 0,
          timestamp: ts
        };
      });

      return cb(null, trades);
    } catch (e) {
      return cb(null, []);
    }
  });
}

module.exports = {
  market_name: 'NestEx',
  market_logo: 'https://trade.nestex.one/favicon.ico',
  market_url_template: market_url_template,
  market_url_case: 'u',

  get_data: function(settings, cb) {
    get_summary(settings.coin, settings.exchange, settings.api_error_msg, function(summary_error, stats) {
      if (summary_error) return cb(summary_error, null);

      get_orders(settings.coin, settings.exchange, settings.api_error_msg, function(order_error, buys, sells) {
        get_trades(settings.coin, settings.exchange, settings.api_error_msg, function(trade_error, trades) {
          return cb(null, {
            buys: buys || [],
            sells: sells || [],
            trades: trades || [],
            stats: stats,
            chartdata: []
          });
        });
      });
    });
  }
};