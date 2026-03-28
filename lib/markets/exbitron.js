const request = require('postman-request');

const base_url = 'https://api.exbitron.com/api/v1';
const market_url_template = 'https://app.exbitron.com/trade/{coin}_{base}';

const rateLimitLib = require('../ratelimit');
const rateLimit = new rateLimitLib.RateLimit(1, 1500, false);

function buildTickerPair(coin, exchange) {
  return (coin + '/' + exchange).toUpperCase();
}

function buildApiPair(coin, exchange) {
  return (coin + '_' + exchange).toUpperCase();
}

function toNumber(value, fallback = 0) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeTimestamp(value) {
  if (value == null) return Math.floor(Date.now() / 1000);

  if (typeof value === 'number') {
    return value > 1000000000000 ? Math.floor(value / 1000) : Math.floor(value);
  }

  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) {
    return Math.floor(parsed / 1000);
  }

  const num = parseInt(value, 10);
  if (Number.isFinite(num)) {
    return num > 1000000000000 ? Math.floor(num / 1000) : num;
  }

  return Math.floor(Date.now() / 1000);
}

function normalizePair(v) {
  return String(v || '')
    .toUpperCase()
    .replace(/[-_]/g, '/')
    .replace(/\s+/g, '');
}

function reqJson(url, cb) {
  rateLimit.schedule(function() {
    request(
      {
        uri: url,
        json: true,
        timeout: 15000,
        headers: {
          'User-Agent': 'Yerbas-Iquidus/1.0',
          'Accept': 'application/json'
        }
      },
      function(error, response, body) {
        if (error) return cb(error, null);

        if (response && response.statusCode >= 400) {
          return cb('HTTP ' + response.statusCode + ' for ' + url, null);
        }

        return cb(null, body);
      }
    );
  });
}

function objectToTickerRows(obj) {
  return Object.keys(obj).map(function(key) {
    const row = obj[key];
    if (row && typeof row === 'object') {
      row.__pair_key = key;
    }
    return row;
  });
}

function getTickerRows(body) {
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.data)) return body.data;
  if (body && Array.isArray(body.tickers)) return body.tickers;
  if (body && typeof body.data === 'object') return objectToTickerRows(body.data);
  if (body && typeof body === 'object') return objectToTickerRows(body);
  return [];
}

function pairFromRow(row) {
  const candidates = [
    row.trading_pairs,
    row.market_pair,
    row.symbol,
    row.ticker_id,
    row.pair,
    row.__pair_key
  ].filter(Boolean);

  for (let i = 0; i < candidates.length; i++) {
    const p = normalizePair(candidates[i]);
    if (p) return p;
  }

  const base = row.base || row.base_currency || row.coin;
  const target = row.target || row.target_currency || row.exchange;

  if (base && target) {
    return normalizePair(base + '/' + target);
  }

  return '';
}

function findTicker(rows, coin, exchange) {
  const target = normalizePair(coin + '/' + exchange);

  return rows.find(function(row) {
    return pairFromRow(row) === target;
  });
}

// SUMMARY
function get_summary(coin, exchange, api_error_msg, cb) {
  reqJson(base_url + '/cg/tickers', function(error, body) {
    if (error) return cb(error, null);
    if (!body) return cb(api_error_msg || 'Exbitron ticker error', null);

    try {
      const rows = getTickerRows(body);
      const t = findTicker(rows, coin, exchange);

      if (!t) {
        console.log('Ticker sample:', JSON.stringify(rows.slice(0, 5), null, 2));
        return cb('Exbitron pair not found: ' + coin + '/' + exchange, null);
      }

      const last = toNumber(t.last_price || t.last || t.price);
      const bid = toNumber(t.highest_bid || t.bid);
      const ask = toNumber(t.lowest_ask || t.ask);
      const high = toNumber(t.high || t.high_24h);
      const low = toNumber(t.low || t.low_24h);
      const volume = toNumber(t.volume || t.base_volume);
      const volume_btc = toNumber(t.quote_volume || t.volume_btc);
      const change = toNumber(t.change_percent || t.price_change_percent_24h);

      let prev = 0;
      if (change !== 0 && last > 0) {
        prev = last / (1 + (change / 100));
      }

      return cb(null, {
        high,
        low,
        volume,
        volume_btc,
        bid,
        ask,
        last,
        prev,
        change
      });
    } catch (e) {
      return cb(e, null);
    }
  });
}

function normalizeOrderRow(row) {
  if (Array.isArray(row)) {
    return { price: toNumber(row[0]), quantity: toNumber(row[1]) };
  }

  return {
    price: toNumber(row.price),
    quantity: toNumber(row.quantity || row.amount)
  };
}

// ORDERBOOK
function get_orders(coin, exchange, api_error_msg, cb) {
  const pair = buildApiPair(coin, exchange);

  reqJson(base_url + '/orderbook/' + encodeURIComponent(pair), function(error, body) {
    if (error || !body) return cb(null, [], []);

    try {
      const buys = (body.bids || []).map(normalizeOrderRow);
      const sells = (body.asks || []).map(normalizeOrderRow);
      return cb(null, buys, sells);
    } catch (e) {
      return cb(null, [], []);
    }
  });
}

function normalizeTradeRow(row) {
  return {
    ordertype: String(row.side || row.type || 'buy').toLowerCase(),
    price: toNumber(row.price),
    quantity: toNumber(row.quantity || row.amount),
    timestamp: normalizeTimestamp(row.timestamp || row.time)
  };
}

function fetchTradesFromEndpoints(endpoints, cb) {
  if (!endpoints.length) return cb(null, []);

  const endpoint = endpoints.shift();
  console.log('Trying:', endpoint);

  reqJson(endpoint, function(error, body) {
    if (error || !body) {
      console.log('Failed:', endpoint);
      return fetchTradesFromEndpoints(endpoints, cb);
    }

    try {
      console.log('Response sample:', JSON.stringify(body).slice(0, 500));

      const rows = body.data || body.trades || body;

      if (!Array.isArray(rows) || !rows.length) {
        return fetchTradesFromEndpoints(endpoints, cb);
      }

      const trades = rows.map(normalizeTradeRow);
      console.log('Trades found:', trades.length);
      return cb(null, trades);
    } catch (e) {
      return fetchTradesFromEndpoints(endpoints, cb);
    }
  });
}

// TRADES
function get_trades(coin, exchange, api_error_msg, cb) {
  const pair = buildApiPair(coin, exchange);

  const endpoints = [
    base_url + '/history/trade?market_pair=' + pair,
    base_url + '/cg/trades?market_pair=' + pair
  ];

  fetchTradesFromEndpoints(endpoints, cb);
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

      get_orders(settings.coin, settings.exchange, settings.api_error_msg, function(_, buys, sells) {
        get_trades(settings.coin, settings.exchange, settings.api_error_msg, function(_, trades) {
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