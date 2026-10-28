# Testing Eazee Pro with the local StoreKit file

App Store Connect products cannot load until the Paid Apps Agreement is signed.
Until then, StoreKit serves the products in `eazee_products.storekit`:

- Pro Monthly, $9.99 (P1M)
- Pro Yearly, $79.99 (P1Y)
- Both have a 2-week free trial and are in the "Eazee Pro" subscription group.

The app logic does not depend on where the products come from. Names, prices,
periods and trials are read at runtime with `expo-iap` `fetchProducts`
(`lib/subscriptionProducts.ts`). When the real App Store Connect products
exist, the same build uses them; only the source changes.

## How the file gets into the iOS project

There is no `ios/` folder; it is generated. The config plugin
`storekit-config.plugin.js` (listed in `app.json`) runs on every
`npx expo prebuild`, including `--clean`. It:

1. copies `eazee_products.storekit` to `ios/Eazee/`;
2. adds it to the Xcode project, without adding it to any target, so it never ships inside the app;
3. sets it as the StoreKit Configuration of the `Eazee` scheme's Run action:
   `<StoreKitConfigurationFileReference identifier = "../Eazee/eazee_products.storekit">`.

To leave it out, set `EAZEE_STOREKIT_CONFIG=false` when running prebuild.
Archived, TestFlight and App Store builds ignore the scheme setting anyway and
always use App Store Connect.

## Running the app against the StoreKit file

Xcode applies a scheme's StoreKit configuration only to apps it launches
itself. Run the app from Xcode:

```sh
npx expo prebuild -p ios      # macOS; regenerates ios/ with the plugin applied
npx pod-install               # if prebuild did not install pods
xed ios                       # opens ios/Eazee.xcworkspace
```

Then, in Xcode:

1. Product > Scheme > Edit Scheme > Run > Options. Check that StoreKit
   Configuration shows `eazee_products.storekit`. If it shows "None", choose
   the file there and tell the team, because the plugin's path needs fixing.
2. Choose a simulator or device and press Run. Metro must be running
   (`npx expo start --dev-client`).

`npx expo run:ios` builds the same project but launches the app through
`simctl` / `devicectl`, not Xcode's debugger, so the StoreKit file is
normally **not** applied and StoreKit would ask App Store Connect (and find no
products). Use `npx expo run:ios` to build, then launch from Xcode for
purchase testing.

## Server settings for local purchases

Xcode signs local StoreKit transactions with its own certificate, not Apple's,
so the server must be told to accept them. It does this only on a development
server. In `eazee-server/.env` (never in production):

```
APP_ENV=development
APPLE_ALLOW_XCODE_TRANSACTIONS=true
SUBSCRIPTION_ENFORCEMENT=true   # needed to test limits
```

The server refuses to start with `APPLE_ALLOW_XCODE_TRANSACTIONS=true` unless
`APP_ENV=development`. Point the app at the local server: in
`config/backend.ts`, debug builds use `http://localhost:8787` (a device needs
your Mac's LAN address instead).

## Useful Xcode tools while testing

- Debug > StoreKit > Manage Transactions: refund, expire or delete
  transactions, and clear the free-trial eligibility.
- Editor > Subscription Renewal Rate, with the `.storekit` file open: speeds
  up renewals (for example, one month every 30 seconds) to test renewals and
  expiry.
- App Store Server Notifications are not sent in local testing. The app syncs
  instead at launch, when it returns to the foreground, after a purchase, and
  after the manage-subscriptions sheet closes.

## Subscription levels (set the same in App Store Connect)

Yearly is level 1 (the top) and Monthly is level 2. Monthly to yearly is an
upgrade: it starts immediately and Apple credits the unused time. Yearly to
monthly is a downgrade: it starts at the next renewal. Set the same order in
App Store Connect > Subscriptions > Eazee Pro.
