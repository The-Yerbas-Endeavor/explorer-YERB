'use strict';

var fs = require('fs');

function loadReport(config, callback) {
  if (!config || config.enabled !== true) {
    return callback({
      status: 404,
      message: 'Smartnode Health is disabled'
    });
  }

  if (!config.report_path) {
    return callback({
      status: 500,
      message: 'Smartnode Health report path is not configured'
    });
  }

  fs.readFile(config.report_path, 'utf8', function(err, contents) {
    if (err) {
      return callback({
        status: 503,
        message: 'Smartnode Health report is unavailable'
      });
    }

    var report;

    try {
      report = JSON.parse(contents);
    } catch (parseError) {
      return callback({
        status: 500,
        message: 'Smartnode Health report contains invalid JSON'
      });
    }

    if (!report || typeof report !== 'object' || !report.summary || !Array.isArray(report.smartnodes)) {
      return callback({
        status: 500,
        message: 'Smartnode Health report has an invalid structure'
      });
    }

    var generatedAt = report.generated_at ? Date.parse(report.generated_at) : NaN;
    var maxAgeMinutes = Number(config.max_report_age_minutes) || 90;
    var ageMinutes = isNaN(generatedAt) ? null : Math.max(0, Math.floor((Date.now() - generatedAt) / 60000));

    report.report_age_minutes = ageMinutes;
    report.report_stale = ageMinutes === null || ageMinutes > maxAgeMinutes;

    callback(null, report);
  });
}

module.exports = {
  loadReport: loadReport
};
