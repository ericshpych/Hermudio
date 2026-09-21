const fs = require('fs');
const path = require('path');

function ensureNcmLoginConfig({ configDir, env = process.env }) {
  const configPath = path.join(configDir, 'config.json');
  const appId = env.NCM_APP_ID || env.NETEASE_APP_ID || '';
  const privateKey = env.NCM_PRIVATE_KEY || env.NETEASE_PRIVATE_KEY || '';

  let config = {};
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (error) {
      config = {};
    }
  }

  const hasCredentials = Boolean(config.appId && config.privateKey);
  if (hasCredentials || !appId || !privateKey) {
    return {
      configPath,
      hydrated: false,
      hasCredentials
    };
  }

  const nextConfig = {
    ...config,
    appId,
    privateKey
  };
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(nextConfig, null, 2) + '\n');

  return {
    configPath,
    hydrated: true,
    hasCredentials: true
  };
}

module.exports = { ensureNcmLoginConfig };
