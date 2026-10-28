const { withDangerousMod, withXcodeProject } = require('@expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Attaches the local StoreKit configuration (eazee_products.storekit) to the
 * generated iOS app's Run scheme, so StoreKit serves the products and prices in
 * that file instead of App Store Connect. Runs on every prebuild, so it
 * survives `expo prebuild --clean`.
 *
 * The scheme setting only applies when the app is launched from Xcode
 * (Product > Run); archived, TestFlight and App Store builds ignore it and use
 * App Store Connect. Set EAZEE_STOREKIT_CONFIG=false to leave it out.
 */
const STOREKIT_FILE = 'eazee_products.storekit';

/** Xcode resolves the identifier relative to the .xcodeproj, so the file sits in the app's source folder. */
const getSchemeIdentifier = (projectName) => `../${projectName}/${STOREKIT_FILE}`;

function addStoreKitReferenceToScheme(schemeXml, identifier) {
  const reference = `      <StoreKitConfigurationFileReference\n         identifier = "${identifier}">\n      </StoreKitConfigurationFileReference>\n`;
  const withoutOld = schemeXml.replace(/[ \t]*<StoreKitConfigurationFileReference[\s\S]*?<\/StoreKitConfigurationFileReference>\n?/g, '');
  if (!/<LaunchAction[\s\S]*?<\/LaunchAction>/.test(withoutOld)) {
    throw new Error('storekit-config: the Xcode scheme has no LaunchAction');
  }
  return withoutOld.replace(/(<LaunchAction[\s\S]*?)(\s*<\/LaunchAction>)/, (_match, body, closing) =>
    `${body.replace(/\n?$/, '\n')}${reference.replace(/\n$/, '')}${closing}`
  );
}

const isEnabled = () => String(process.env.EAZEE_STOREKIT_CONFIG || '').trim().toLowerCase() !== 'false';

const withStoreKitFile = (config) =>
  withDangerousMod(config, [
    'ios',
    async (modConfig) => {
      const { projectRoot, platformProjectRoot, projectName } = modConfig.modRequest;
      const source = path.join(projectRoot, STOREKIT_FILE);
      if (!fs.existsSync(source)) {
        throw new Error(`storekit-config: ${STOREKIT_FILE} was not found in the project root`);
      }
      fs.copyFileSync(source, path.join(platformProjectRoot, projectName, STOREKIT_FILE));

      const schemePath = path.join(
        platformProjectRoot,
        `${projectName}.xcodeproj`,
        'xcshareddata',
        'xcschemes',
        `${projectName}.xcscheme`
      );
      if (!fs.existsSync(schemePath)) {
        throw new Error(`storekit-config: the scheme ${path.basename(schemePath)} was not generated`);
      }
      const scheme = fs.readFileSync(schemePath, 'utf8');
      fs.writeFileSync(schemePath, addStoreKitReferenceToScheme(scheme, getSchemeIdentifier(projectName)));
      return modConfig;
    },
  ]);

/** Listed in the Xcode project so it can be edited there; not added to any target, so it never ships in the app. */
const withStoreKitFileReference = (config) =>
  withXcodeProject(config, (modConfig) => {
    const project = modConfig.modResults;
    const { projectName } = modConfig.modRequest;
    const groupKey = project.findPBXGroupKey({ name: projectName }) || project.findPBXGroupKey({ path: projectName });
    const alreadyListed = Object.values(project.pbxFileReferenceSection())
      .some((file) => typeof file === 'object' && String(file.path || '').replace(/"/g, '') === STOREKIT_FILE);
    if (groupKey && !alreadyListed) {
      const file = project.addFile(STOREKIT_FILE, groupKey, { lastKnownFileType: 'text' });
      // The xcode library writes these out literally as "undefined" when they are not set.
      const reference = file && project.pbxFileReferenceSection()[file.fileRef];
      if (reference) {
        delete reference.explicitFileType;
        delete reference.includeInIndex;
      }
    }
    return modConfig;
  });

const withStoreKitConfig = (config) => {
  if (!isEnabled()) return config;
  return withStoreKitFileReference(withStoreKitFile(config));
};

module.exports = withStoreKitConfig;
module.exports.addStoreKitReferenceToScheme = addStoreKitReferenceToScheme;
module.exports.getSchemeIdentifier = getSchemeIdentifier;
module.exports.STOREKIT_FILE = STOREKIT_FILE;
