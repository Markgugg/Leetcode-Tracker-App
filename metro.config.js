const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'ws') return { type: 'empty' };
  return context.resolveRequest(context, moduleName, platform);
};

config.watchFolders = [__dirname];
config.resolver.blockList = [
  new RegExp(`${path.resolve(__dirname, 'supabase').replace(/\\/g, '\\\\')}.*`),
];

module.exports = config;
