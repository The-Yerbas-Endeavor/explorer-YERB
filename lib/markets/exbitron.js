const request = require('postman-request');
const rateLimitLib = require('../ratelimit');

const market_url_template = 'https://app.exbitron.com/trade/{coin}_{base}';

// Prefer the app.exbitron.com API documented at /api-documentation,
// but keep legacy api.exbitron.com fallback for backward compatibility.
const baseUrls = [
  'https://app.exbitron.com/api/v1',
  'https://app.exbitron.com/api',
  'https://api.exbitron.com/api/v1'
];

const rateLimit = new rateLimitLib.RateLimit(1, 2000, false);

function buildPair(coin, exchange) {
  return (coin + '_' + exchange).toUpperCase();
}

function parseNumber(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function toEpochSeconds(value) {
  if (value == null) return Math.floor(Date.now() / 1000);

  if (typeof value === 'number') {
    if (value > 1000000000000) return Math.floor(value / 1000);
    return Math.floor(value);
  }

  if (typeof value === 'string') {
    if (/^\d+$/.test(value)) {
      const n = parseInt(value, 10);
      if (n > 1000000000000) return Math.floor(n / 1000);
      return n;
    }

    const ts = Date.parse(value);
    if (!Number.isNaN(ts)) return Math.floor(ts / 1000);
  }

  return Math.floor(Date.now() / 1000);
}

function reqJson(url, cb) {
  rateLimit.schedule(function() {
    request({
      uri: url,
      json: true,
      timeout: 12000,
      headers: {
        'User-Agent': 'Yerbas-Iquidus/1.0',
        Accept: 'application/json'
      }
    }, function(error, response, body) {
      if (error) return cb(error, null);
      if (response && response.statusCode >= 400) {
        return cb('HTTP ' + response.statusCode + ' for ' + url, null);
      }
      return cb(null, body);
    });
  });
}

function requestWithFallback(endpoints, cb) {
  let i = 0;

  function next(lastError) {
    if (i >= endpoints.length) return cb(lastError || 'Exbitron API request failed', null);

    const url = endpoints[i];
    i += 1;

    reqJson(url, function(error, body) {
      if (error || body == null) return next(error || ('Empty response from ' + url));
      return cb(null, body);
    });
  }

  next(null);
}

function findMarketRow(rows, pair) {
  if (!Array.isArray(rows)) return null;

  return rows.find(function(row) {
    const key = String(
      row.trading_pairs || row.market_pair || row.symbol || row.ticker_id || row.market || ''
    ).toUpperCase();

    return key === pair;
  }) || null;
}

function parseSummaryFromBody(body, pair) {
  const summaryRows = Array.isArray(body)
    ? body
    : (Array.isArray(body.data) ? body.data : (Array.isArray(body.tickers) ? body.tickers : []));

  const t = findMarketRow(summaryRows, pair);
  if (!t) return null;

  const changePct = parseNumber(
    t.price_change_percent_24h || t.percent_change || t.change || t.change_24h
  );

  return {
    high: parseNumber(t.highest_price_24h || t.high || t.high_24h),
    low: parseNumber(t.lowest_price_24h || t.low || t.low_24h),
    volume: parseNumber(t.base_volume || t.base_volume_24h || t.volume || t.vol),
    volume_btc: parseNumber(t.quote_volume || t.quote_volume_24h || t.target_volume || 0),
    bid: parseNumber(t.highest_bid || t.bid || t.highestBuy || t.best_bid),
    ask: parseNumber(t.lowest_ask || t.ask || t.lowestSell || t.best_ask),
    last: parseNumber(t.last_price || t.last || t.last_price_usd || t.lastRate),
    prev: 0,
    change: changePct
  };
}

function get_summary(coin, exchange, api_error_msg, cb) {
  const pair = buildPair(coin, exchange);
  const endpoints = [];

  baseUrls.forEach(function(base) {
    endpoints.push(base + '/cmc/summary');
    endpoints.push(base + '/ticker');
    endpoints.push(base + '/tickers');
    endpoints.push(base + '/public/ticker');
  });

  requestWithFallback(endpoints, function(error, body) {
    if (error) return cb(api_error_msg || error, null);

    try {
      const stats = parseSummaryFromBody(body, pair);
      if (!stats) return cb('Exbitron pair not found: ' + pair, null);
      return cb(null, stats);
    } catch (e) {
      return cb(e, null);
    }
  });
}

function parseOrderbookSide(side) {
  if (!Array.isArray(side)) return [];

  return side.map(function(row) {
    if (Array.isArray(row)) {
      return {
        price: parseNumber(row[0]),
        quantity: parseNumber(row[1])
      };
    }

    return {
      price: parseNumber(row.price || row.rate || row.px),
      quantity: parseNumber(row.quantity || row.amount || row.qty || row.volume)
    };
  }).filter(function(x) {
    return x.price > 0 && x.quantity > 0;
  });
}

function get_orders(coin, exchange, api_error_msg, cb) {
  const pair = buildPair(coin, exchange);
  const endpoints = [];

  baseUrls.forEach(function(base) {
    endpoints.push(base + '/cmc/orderbook?market_pair=' + pair + '&level=2');
    endpoints.push(base + '/orderbook?market_pair=' + pair + '&depth=200');
    endpoints.push(base + '/orderbook?ticker_id=' + pair + '&depth=200');
    endpoints.push(base + '/public/orderbook?symbol=' + pair + '&depth=200');
  });

  requestWithFallback(endpoints, function(error, body) {
    if (error || !body) return cb(null, [], []);

    try {
      const bids = body.bids || body.buy || body.buys || [];
      const asks = body.asks || body.sell || body.sells || [];

      return cb(null, parseOrderbookSide(bids), parseOrderbookSide(asks));
    } catch (e) {
      return cb(null, [], []);
    }
  });
}

function parseTrades(body) {
  const rows = Array.isArray(body)
    ? body
    : (Array.isArray(body.data) ? body.data : (Array.isArray(body.trades) ? body.trades : []));

  if (!Array.isArray(rows)) return [];

  return rows.map(function(row) {
    return {
      ordertype: String(row.type || row.side || row.aggressiveSide || 'buy').toLowerCase(),
      price: parseNumber(row.price || row.rate || row.px),
      quantity: parseNumber(row.base_volume || row.amount || row.quantity || row.qty || row.size),
      timestamp: toEpochSeconds(row.timestamp || row.time || row.created_at || row.ts)
    };
  }).filter(function(t) {
    return t.price > 0 && t.quantity > 0;
  });
}

function get_trades(coin, exchange, api_error_msg, cb) {
  const pair = buildPair(coin, exchange);
  const endpoints = [];

  baseUrls.forEach(function(base) {
    endpoints.push(base + '/cmc/trades?market_pair=' + pair);
    endpoints.push(base + '/trades?market_pair=' + pair);
    endpoints.push(base + '/trades?ticker_id=' + pair);
    endpoints.push(base + '/public/trades?symbol=' + pair);
  });

  requestWithFallback(endpoints, function(error, body) {
    if (error || !body) return cb(null, []);

    try {
      return cb(null, parseTrades(body));
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
      if (summary_error || !stats) return cb(summary_error || 'Exbitron summary error', null);

      get_orders(settings.coin, settings.exchange, settings.api_error_msg, function(order_error, buys, sells) {
        if (order_error) {
          // Keep explorer data flowing even if orderbook endpoint fails.
          buys = [];
          sells = [];
        }

        get_trades(settings.coin, settings.exchange, settings.api_error_msg, function(trade_error, trades) {
          if (trade_error) trades = [];

          return cb(null, {
            buys: buys,
            sells: sells,
            trades: trades,
            stats: stats,
            chartdata: []
          });
        });
      });
    });
  }
};
