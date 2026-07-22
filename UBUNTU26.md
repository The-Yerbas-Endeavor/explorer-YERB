# Ubuntu 26 deployment

This branch prepares the Yerbas eIquidus explorer for Ubuntu 26 with Node.js 22, MongoDB 8, PM2, nginx, and UFW.

## Install

```bash
git clone --branch ubuntu-26 https://github.com/The-Yerbas-Endeavor/explorer-YERB.git
cd explorer-YERB
sudo bash install-ubuntu26.sh
```

The installer defaults to:

- Application directory: `~/explorer-YERB`
- Node.js: 22
- MongoDB: 8.0
- Explorer port: 3001
- Public web port: 80 through nginx
- PM2 process name: `explorer-YERB`

## Configure Yerbas RPC

After installation, edit `settings.json` and configure the wallet RPC connection, coin details, markets, and public hostname. The RPC username, password, port, and wallet daemon settings must match `yerbas.conf`.

Restart after changing settings:

```bash
pm2 restart explorer-YERB
pm2 logs explorer-YERB
```

## Useful checks

```bash
node --version
mongod --version
pm2 status
sudo systemctl status mongod nginx
sudo nginx -t
curl -I http://127.0.0.1:3001
```

## MongoDB packages on Ubuntu 26

Until MongoDB publishes packages specifically labeled for Ubuntu 26, the installer uses MongoDB 8 packages from the Ubuntu 24.04 `noble` repository. This should be replaced with the native Ubuntu 26 repository as soon as MongoDB publishes one.

## Compatibility workflow

`.github/workflows/ubuntu26.yml` tests the project with Node.js 22, validates JavaScript entry points, runs the Jasmine test suite, checks installer syntax, and uploads the generated lockfile for troubleshooting.
