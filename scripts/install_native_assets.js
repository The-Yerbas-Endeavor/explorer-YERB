'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function patchFile(relativePath, transform) {
  const filename = path.join(root, relativePath);
  const original = fs.readFileSync(filename, 'utf8');
  const updated = transform(original);
  if (updated === original) {
    console.log(relativePath + ': already integrated');
    return;
  }
  fs.writeFileSync(filename, updated, 'utf8');
  console.log(relativePath + ': updated');
}

patchFile('app.js', (source) => {
  let output = source;
  if (!output.includes("assetRoutes = require('./routes/assets')")) {
    const marker = "    routes = require('./routes/index'),\n";
    if (!output.includes(marker)) throw new Error('Unable to find routes import in app.js');
    output = output.replace(marker, marker + "    assetRoutes = require('./routes/assets'),\n");
  }
  if (!output.includes("app.use('/', assetRoutes);")) {
    const marker = "app.use('/api', nodeapi.app);\n";
    if (!output.includes(marker)) throw new Error('Unable to find API router mount in app.js');
    output = output.replace(marker, marker + "app.use('/', assetRoutes);\n");
  }
  return output;
});

patchFile('views/layout.pug', (source) => {
  if (source.includes('li#assets.nav-item')) return source;
  const marker = "              if settings.blockchain_specific.heavycoin.enabled == true && settings.blockchain_specific.heavycoin.reward_page.enabled == true\n";
  if (!source.includes(marker)) throw new Error('Unable to find navigation insertion point in views/layout.pug');
  const menu = "              li#assets.nav-item\n" +
    "                a.nav-link(href='/assets')\n" +
    "                  span.fas.fa-layer-group\n" +
    "                  span.margin-left-5 Assets\n";
  return source.replace(marker, menu + marker);
});

console.log('Native Yerbas asset explorer integration complete.');
