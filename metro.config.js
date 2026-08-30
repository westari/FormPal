const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);

// Bundle .html files as assets so they can be require()'d and handed to a
// react-native-webview <WebView source={require('...')} /> — used by the
// onboarding-test rank run, which renders the exact Claude-designed HTML
// artifacts in assets/onboarding/ verbatim.
config.resolver.assetExts.push("html");

module.exports = config;
