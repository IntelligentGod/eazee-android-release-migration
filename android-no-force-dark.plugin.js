const { AndroidConfig, withAndroidStyles } = require('@expo/config-plugins');

// Xiaomi HyperOS dark mode darkens light-themed apps on its own, which turned the mint
// splash into a dark screen with a square. The app keeps its own colors in dark mode.
module.exports = function androidNoForceDarkPlugin(config) {
  return withAndroidStyles(config, (config) => {
    const themes = [
      AndroidConfig.Styles.getAppThemeGroup(),
      { name: 'Theme.App.SplashScreen', parent: 'Theme.SplashScreen' },
    ];
    for (const parent of themes) {
      config.modResults = AndroidConfig.Styles.assignStylesValue(config.modResults, {
        add: true,
        parent,
        name: 'android:forceDarkAllowed',
        value: 'false',
      });
    }
    return config;
  });
};
