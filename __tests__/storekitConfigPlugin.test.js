const {
  addStoreKitReferenceToScheme,
  getSchemeIdentifier,
} = require('../storekit-config.plugin.js');

const SCHEME = `<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion = "1130" version = "1.3">
   <LaunchAction
      buildConfiguration = "Debug"
      launchStyle = "0"
      allowLocationSimulation = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
      </BuildableProductRunnable>
   </LaunchAction>
   <ProfileAction
      buildConfiguration = "Release">
   </ProfileAction>
</Scheme>
`;

describe('storekit-config plugin', () => {
  it('points the Run scheme at the StoreKit file in the app folder', () => {
    const scheme = addStoreKitReferenceToScheme(SCHEME, getSchemeIdentifier('Eazee'));
    const launchAction = scheme.match(/<LaunchAction[\s\S]*?<\/LaunchAction>/)[0];

    expect(launchAction).toContain('identifier = "../Eazee/eazee_products.storekit"');
    expect(scheme.match(/<ProfileAction[\s\S]*?<\/ProfileAction>/)[0]).not.toContain('StoreKit');
  });

  it('is idempotent, so repeated prebuilds keep one reference', () => {
    const once = addStoreKitReferenceToScheme(SCHEME, getSchemeIdentifier('Eazee'));
    const twice = addStoreKitReferenceToScheme(once, getSchemeIdentifier('Eazee'));

    expect(twice).toBe(once);
    expect(twice.match(/StoreKitConfigurationFileReference identifier|<StoreKitConfigurationFileReference/g)).toHaveLength(1);
  });

  it('fails loudly when the scheme has no LaunchAction', () => {
    expect(() => addStoreKitReferenceToScheme('<Scheme></Scheme>', 'x')).toThrow(/LaunchAction/);
  });
});
