var express = require('express'),
    router = express.Router(),
    settings = require('../lib/settings'),
    locale = require('../lib/locale'),
    db = require('../lib/database'),
    lib = require('../lib/explorer'),
    smartnodeHealth = require('../lib/smartnode-health'),
    qr = require('qr-image');

function route_get_block(res, blockhash) {
  lib.get_block(blockhash, function (block) {
    if (block && block != 'There was an error. Check your console.') {
      if (blockhash == settings.block_page.genesis_block)
        res.render('block', { active: 'block', block: block, confirmations: settings.shared_pages.confirmations, txs: 'GENESIS', showSync: db.check_show_sync_message(), styleHash: get_file_timestamp('./public/css/style.scss'), themeHash: get_file_timestamp('./public/css/themes/' + settings.shared_pages.theme.toLowerCase() + '/bootstrap.min.css'), page_title_prefix: settings.coin.name + ' Genesis Block' });
      else {
        db.get_txs(block, function(txs) {
          if (txs.length > 0)
            res.render('block', { active: 'block', block: block, confirmations: settings.shared_pages.confirmations, txs: txs, showSync: db.check_show_sync_message(), styleHash: get_file_timestamp('./public/css/style.scss'), themeHash: get_file_timestamp('./public/css/themes/' + settings.shared_pages.theme.toLowerCase() + '/bootstrap.min.css'), page_title_prefix: settings.coin.name + ' Block ' + block.height });
          else {
            var ntxs = [];
            lib.syncLoop(block.tx.length, function (loop) {
              var i = loop.iteration();
              lib.get_rawtransaction(block.tx[i], function(tx) {
                if (tx && tx != 'There was an error. Check your console.') {
                  lib.prepare_vin(tx, function(vin, tx_type_vin) {
                    lib.prepare_vout(tx.vout, block.tx[i], vin, ((!settings.blockchain_specific.zksnarks.enabled || typeof tx.vjoinsplit === 'undefined' || tx.vjoinsplit == null) ? [] : tx.vjoinsplit), function(vout, nvin, tx_type_vout) {
                      lib.calculate_total(vout, function(total) {
                        ntxs.push({ txid: block.tx[i], vout: vout, total: total.toFixed(8) });
                        loop.next();
                      });
                    });
                  });
                } else
                  loop.next();
              });
            }, function() {
              res.render('block', { active: 'block', block: block, confirmations: settings.shared_pages.confirmations, txs: ntxs, showSync: db.check_show_sync_message(), styleHash: get_file_timestamp('./public/css/style.scss'), themeHash: get_file_timestamp('./public/css/themes/' + settings.shared_pages.theme.toLowerCase() + '/bootstrap.min.css'), page_title_prefix: settings.coin.name + ' Block ' + block.height });
            });
          }
        });
      }
    } else {
      if (!isNaN(blockhash)) {
        var height = blockhash;
        lib.get_blockhash(height, function(hash) {
          if (hash && hash != 'There was an error. Check your console.')
            res.redirect('/block/' + hash);
          else
            route_get_index(res, 'Block not found: ' + blockhash);
        });
      } else
        route_get_index(res, 'Block not found: ' + blockhash);
    }
  });
}

function get_file_timestamp(file_name) {
  if (db.fs.existsSync(file_name))
    return parseInt(db.fs.statSync(file_name).mtimeMs / 1000);
  else
    return null;
}

function route_get_index(res, error) {
  if (settings.index_page.page_header.show_last_updated == true) {
    db.get_stats(settings.coin.name, function (stats) {
      res.render('index', { active: 'home', error: error, last_updated: stats.blockchain_last_updated, showSync: db.check_show_sync_message(), styleHash: get_file_timestamp('./public/css/style.scss'), themeHash: get_file_timestamp('./public/css/themes/' + settings.shared_pages.theme.toLowerCase() + '/bootstrap.min.css'), page_title_prefix: settings.coin.name + ' Block Explorer' });
    });
  } else {
    res.render('index', { active: 'home', error: error, last_updated: null, showSync: db.check_show_sync_message(), styleHash: get_file_timestamp('./public/css/style.scss'), themeHash: get_file_timestamp('./public/css/themes/' + settings.shared_pages.theme.toLowerCase() + '/bootstrap.min.css'), page_title_prefix: settings.coin.name + ' Block Explorer' });
  }
}

/* Existing routes are unchanged above and below this inserted section. */

router.get('/node-map', function(req, res) {
  if (settings.network_page.enabled == true || settings.masternodes_page.enabled == true) {
    return res.render('node-map', {
      active: 'node-map',
      showSync: db.check_show_sync_message(),
      styleHash: get_file_timestamp('./public/css/style.scss'),
      themeHash: get_file_timestamp('./public/css/themes/' + settings.shared_pages.theme.toLowerCase() + '/bootstrap.min.css'),
      page_title_prefix: settings.coin.name + ' Node Map'
    });
  }

  return route_get_index(res, null);
});

module.exports = router;
