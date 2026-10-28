// AsyncStorage has no native module under Jest. Subscription entitlement and
// usage metering sit behind lib/aiRequest, so almost any module that touches AI
// now pulls AsyncStorage in transitively - register its official mock globally
// rather than repeating it in every suite.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
