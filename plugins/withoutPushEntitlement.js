// expo-notifications auto-applies its own config plugin, which adds the Push
// Notifications entitlement ("aps-environment"). The ad-hoc provisioning profile for
// com.athlt.formpal doesn't have that capability, so the Xcode archive failed
// ("Provisioning profile ... does not support the Push Notifications capability").
// FormPal only uses LOCAL notifications (trial reminders), which don't need push.
// This strips the entitlement. If real push is ever needed: enable Push Notifications
// on the App ID in the Apple Developer portal, regenerate the profile, delete this plugin.
const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, (c) => {
    delete c.modResults['aps-environment'];
    return c;
  });
};
