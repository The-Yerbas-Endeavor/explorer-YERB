'use strict';

var express = require('express'),
    router = express.Router(),
    db = require('../lib/database'),
    settings = require('../lib/settings'),
    ai = require('../lib/yerbas-ai');

var requestBuckets = new Map();
var rateWindowMs = 60 * 1000;
var rateLimit = parseInt(process.env.YERBAS_AI_RATE_LIMIT || '20', 10);

if (!Number.isFinite(rateLimit) || rateLimit < 1)
  rateLimit = 20;

function get_file_timestamp(file_name) {
  if (db.fs.existsSync(file_name))
    return parseInt(db.fs.statSync(file_name).mtimeMs / 1000);

  return null;
}

function allowRequest(key) {
  var now = Date.now();
  var bucket = requestBuckets.get(key);

  if (!bucket || now - bucket.started >= rateWindowMs) {
    requestBuckets.set(key, { started: now, count: 1 });
    return true;
  }

  if (bucket.count >= rateLimit)
    return false;

  bucket.count += 1;
  requestBuckets.set(key, bucket);

  if (requestBuckets.size > 5000) {
    requestBuckets.forEach(function(value, bucketKey) {
      if (now - value.started >= rateWindowMs)
        requestBuckets.delete(bucketKey);
    });
  }

  return true;
}

router.get('/ask', function(req, res) {
  if (!ai.isEnabled())
    return res.status(404).send('Ask Yerbas is disabled');

  res.render('ai', {
    active: 'ai',
    ai_status: ai.getStatus(),
    showSync: db.check_show_sync_message(),
    styleHash: get_file_timestamp('./public/css/style.scss'),
    themeHash: get_file_timestamp('./public/css/themes/' + settings.shared_pages.theme.toLowerCase() + '/bootstrap.min.css'),
    page_title_prefix: 'Ask Yerbas'
  });
});

router.get('/ext/ai/status', function(req, res) {
  res.json(ai.getStatus());
});

router.post('/ext/ai/query', function(req, res) {
  if (!ai.isEnabled())
    return res.status(404).json({ ok: false, error: 'Ask Yerbas is disabled' });

  var key = req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';

  if (!allowRequest(key)) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({
      ok: false,
      error: 'Ask Yerbas rate limit reached. Try again shortly.'
    });
  }

  ai.query(req.body && req.body.question, function(result, err) {
    if (err) {
      var status = err.code === 'question_too_long' ? 413 : 400;

      if (err.code === 'provider_error')
        status = 502;

      return res.status(status).json({
        ok: false,
        code: err.code,
        error: err.message
      });
    }

    res.json({
      ok: true,
      mode: result.mode,
      answer: result.answer,
      sources: result.sources || []
    });
  });
});

module.exports = router;
