import { Dimensions, type KeyboardEvent } from 'react-native';

/**
 * How far a composer laid out from the bottom of the screen (edge-to-edge) must move up to sit
 * above the Android keyboard. React Native reports the keyboard without the navigation bar under
 * it, and phones such as Xiaomi report that bar differently, so the distance from the keyboard's
 * top edge to the bottom of the screen is used too, and the larger one wins: a composer a little
 * too high is fine, one under the keyboard cannot be used.
 */
export function getAndroidKeyboardOverlap(event: KeyboardEvent | undefined, bottomInset: number) {
  const keyboardHeight = event?.endCoordinates?.height || 0;
  const keyboardTop = event?.endCoordinates?.screenY;
  const fromKeyboardTop = typeof keyboardTop === 'number' && keyboardTop > 0
    ? Dimensions.get('screen').height - keyboardTop
    : 0;
  return Math.max(keyboardHeight + bottomInset, fromKeyboardTop);
}
