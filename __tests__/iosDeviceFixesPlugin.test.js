const withIosDeviceFixes = require('../ios-device-fixes.plugin.js');

const applyInfoPlistMod = async (modResults) => {
  const config = withIosDeviceFixes({ name: 'Eazee', slug: 'wave' });

  return config.mods.ios.infoPlist({
    name: 'Eazee',
    slug: 'wave',
    modResults,
    modRequest: {},
  });
};

const getUrlSchemes = (config) => (
  config.ios.infoPlist.CFBundleURLTypes.flatMap((urlType) => urlType.CFBundleURLSchemes || [])
);

describe('ios-device-fixes plugin', () => {
  it('adds the Google OAuth redirect scheme to generated iOS Info.plist config', async () => {
    const config = await applyInfoPlistMod({
      CFBundleURLTypes: [
        { CFBundleURLSchemes: ['eazee'] },
        { CFBundleURLSchemes: ['exp+wave'] },
      ],
    });

    expect(getUrlSchemes(config)).toContain('com.eazee.ai');
  });

  it('does not duplicate the Google OAuth redirect scheme', async () => {
    const config = await applyInfoPlistMod({
      CFBundleURLTypes: [
        { CFBundleURLSchemes: ['eazee', 'com.eazee.ai'] },
      ],
    });

    expect(getUrlSchemes(config).filter((scheme) => scheme === 'com.eazee.ai')).toHaveLength(1);
  });
});
