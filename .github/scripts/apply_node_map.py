from pathlib import Path


def replace_once(path, old, new, label):
    file_path = Path(path)
    text = file_path.read_text()

    if new in text:
        print(f"{label}: already applied")
        return

    count = text.count(old)
    if count != 1:
        raise SystemExit(
            f"{label}: expected exactly one marker, found {count}"
        )

    file_path.write_text(text.replace(old, new, 1))
    print(f"{label}: applied")


replace_once(
    "lib/settings.js",
    "/* Shared page settings */",
    '''// node_map_page: controls the interactive network and Smartnode map page
exports.node_map_page = {
  "enabled": true,
  "default_layer": "smartnodes",
  "show_network_nodes": true,
  "show_smartnodes": true,
  "map_height": 650
};

/* Shared page settings */''',
    "lib/settings.js node_map_page defaults",
)

route_marker = """// masternode list page
router.get('/masternodes', function(req, res) {"""

route_block = """// node map page and data API
router.get('/node-map', function(req, res) {
  if (
    settings.node_map_page &&
    settings.node_map_page.enabled === true
  ) {
    return res.render('node-map', {
      active: 'node-map',
      showSync: db.check_show_sync_message(),
      styleHash: get_file_timestamp('./public/css/style.scss'),
      themeHash: get_file_timestamp(
        './public/css/themes/' +
        settings.shared_pages.theme.toLowerCase() +
        '/bootstrap.min.css'
      ),
      page_title_prefix: settings.coin.name + ' Node Map'
    });
  }

  return route_get_index(res, null);
});

router.get('/ext/getnodemap', function(req, res) {
  if (
    !settings.node_map_page ||
    settings.node_map_page.enabled !== true
  ) {
    return res.status(404).json({
      error: 'Node map is disabled'
    });
  }

  var type = String(req.query.type || 'smartnodes').toLowerCase();

  if (type === 'network') {
    if (settings.node_map_page.show_network_nodes === false) {
      return res.status(404).json({
        error: 'Network node map is disabled'
      });
    }

    var Peers = require('../models/peers');

    return Peers.find({}).lean().exec(function(err, peers) {
      if (err) {
        return res.status(500).json({
          error: 'Unable to load network peers'
        });
      }

      peers = Array.isArray(peers) ? peers : [];

      var countries = {};
      peers.forEach(function(peer) {
        var code = String(peer.country_code || '').toUpperCase();
        if (code)
          countries[code] = true;
      });

      return res.json({
        type: 'network',
        summary: {
          total: peers.length,
          countries: Object.keys(countries).length
        },
        nodes: peers
      });
    });
  }

  if (type !== 'smartnodes') {
    return res.status(400).json({
      error: 'Invalid node map type'
    });
  }

  if (settings.node_map_page.show_smartnodes === false) {
    return res.status(404).json({
      error: 'Smartnode map is disabled'
    });
  }

  if (
    !settings.smartnode_health_page ||
    settings.smartnode_health_page.enabled !== true
  ) {
    return res.status(503).json({
      error: 'Smartnode Health is not enabled'
    });
  }

  return smartnodeHealth.loadReport(
    settings.smartnode_health_page,
    function(err, report) {
      if (err) {
        return res.status(err.status || 503).json({
          error: err.message || 'Smartnode Health report is unavailable'
        });
      }

      var summary = Object.assign({}, report.summary || {});
      var statuses = summary.statuses || {};

      if (summary.pose_banned == null)
        summary.pose_banned = Number(statuses.POSE_BANNED || 0);

      return res.json({
        type: 'smartnodes',
        generated_at: report.generated_at || null,
        report_age_minutes: report.report_age_minutes,
        report_stale: report.report_stale,
        summary: summary,
        nodes: Array.isArray(report.smartnodes)
          ? report.smartnodes
          : []
      });
    }
  );
});

// masternode list page
router.get('/masternodes', function(req, res) {"""

replace_once(
    "routes/index.js",
    route_marker,
    route_block,
    "routes/index.js node map route and API",
)

nav_marker = """              if settings.network_page.enabled == true
                li#network.nav-item
                  a.nav-link(href='/network')
                    span.fas.fa-network-wired
                    span.margin-left-5 #{settings.locale.menu_network}
              if settings.richlist_page.enabled == true"""

nav_block = """              if settings.network_page.enabled == true
                li#network.nav-item
                  a.nav-link(href='/network')
                    span.fas.fa-network-wired
                    span.margin-left-5 #{settings.locale.menu_network}
              if settings.node_map_page && settings.node_map_page.enabled == true
                li#node-map.nav-item
                  a.nav-link(href='/node-map')
                    span.fas.fa-globe-americas
                    span.margin-left-5 Node Map
              if settings.richlist_page.enabled == true"""

replace_once(
    "views/layout.pug",
    nav_marker,
    nav_block,
    "views/layout.pug Node Map navigation item",
)

replace_once(
    "views/node-map.pug",
    """    #nodeMap {
      height: 650px;""",
    """    #nodeMap {
      height: #{settings.node_map_page && settings.node_map_page.map_height ? settings.node_map_page.map_height : 650}px;""",
    "views/node-map.pug configurable map height",
)

print("All guarded patches completed successfully")
