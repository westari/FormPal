// expo-apple-authentication auto-applies its own config plugin (via
// @expo/prebuild-config) the moment the package is installed, which adds the
// "Sign In with Apple" entitlement. The current ad-hoc provisioning profile for
// com.athlt.formpal doesn't have that capability, so the Xcode archive fails
// ("Provisioning profile ... does not support the Sign In with Apple capability").
// This strips the entitlement until the capability is enabled on the App ID in the
// Apple Developer portal and the profile regenerated — then delete this plugin
// and add "expo-apple-authentication" back to app.json's plugins.
const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = function withoutAppleSignIn(config) {
  return withEntitlementsPlist(config, (c) => {
    delete c.modResults['com.apple.developer.applesignin'];
    return c;
  });
};
