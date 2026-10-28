const {
  getSentryExpoConfig
} = require("@sentry/react-native/metro");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getSentryExpoConfig(__dirname);

config.resolver.assetExts.push('hdr', 'bin');

// On a disk that does not deliver file events, Watchman stalls every start for a minute and then
// prints an error. Set EAZEE_DISABLE_WATCHMAN=true in your local .env to skip it.
if (process.env.EAZEE_DISABLE_WATCHMAN === 'true') {
  config.resolver.useWatchman = false;
}

module.exports = config;