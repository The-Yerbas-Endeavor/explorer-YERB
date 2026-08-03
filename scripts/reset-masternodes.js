#!/usr/bin/env node

'use strict';

const { MongoClient } = require('mongodb');
const settings = require('../lib/settings');

async function main() {
  const db = settings.dbsettings;

  const username = encodeURIComponent(db.user || '');
  const password = encodeURIComponent(db.password || '');
  const host = db.address || '127.0.0.1';
  const port = Number(db.port || 27017);
  const database = db.database || 'explorerdb';

  const credentials =
    username.length > 0
      ? `${username}:${password}@`
      : '';

  const authSource =
    db.authenticationDatabase ||
    db.authSource ||
    database;

  const uri =
    `mongodb://${credentials}${host}:${port}/${database}` +
    `?authSource=${encodeURIComponent(authSource)}`;

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 10000
  });

  try {
    await client.connect();

    const databaseHandle = client.db(database);
    const collections =
      await databaseHandle
        .listCollections({ name: 'masternodes' })
        .toArray();

    if (collections.length > 0) {
      await databaseHandle.collection('masternodes').drop();
      console.log('Dropped masternodes collection');
    } else {
      console.log('Masternodes collection does not exist');
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
