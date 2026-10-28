jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));

import React from 'react';
import { Modal } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

import AppDialogHost, { DIALOG_PRESENT_RETRY_MS, toDialogButtons } from '@/components/AppDialogHost';
import { presentDisclosure } from '@/lib/appDisclosure';

const shape = (buttons: ReturnType<typeof toDialogButtons>) => buttons.map(({ text, tone }) => [text, tone]);

describe('toDialogButtons', () => {
  it('shows a single OK when an alert has no buttons', () => {
    expect(shape(toDialogButtons(undefined))).toEqual([['OK', 'primary']]);
  });

  it('puts the main action first and cancel last', () => {
    expect(shape(toDialogButtons([
      { text: 'Cancel', style: 'cancel' },
      { text: 'Save' },
    ]))).toEqual([['Save', 'primary'], ['Cancel', 'secondary']]);
  });

  it('keeps destructive actions red and other choices outlined', () => {
    expect(shape(toDialogButtons([
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive' },
    ]))).toEqual([['Delete', 'destructive'], ['Cancel', 'secondary']]);

    expect(shape(toDialogButtons([
      { text: 'Privacy Policy' },
      { text: 'Not Now' },
      { text: 'Allow', isPreferred: true },
    ]))).toEqual([['Allow', 'primary'], ['Privacy Policy', 'secondary'], ['Not Now', 'secondary']]);
  });

  it('runs the original button action', () => {
    const onPress = jest.fn();
    toDialogButtons([{ text: 'OK', onPress }])[0].onPress?.();
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('AppDialogHost presentation', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const request = { title: 'AI data sharing', message: 'Allow?', confirmLabel: 'Allow', cancelLabel: 'Not now' };

  function renderHost() {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<AppDialogHost />);
    });
    return { modal: () => renderer.root.findByType(Modal), unmount: () => renderer.unmount() };
  }

  it('presents a dialog again when iOS never showed it, e.g. behind a closing sheet', () => {
    const host = renderHost();
    act(() => {
      void presentDisclosure(request);
    });
    expect(host.modal().props.visible).toBe(true);

    act(() => {
      jest.advanceTimersByTime(DIALOG_PRESENT_RETRY_MS);
    });
    expect(host.modal().props.visible).toBe(false);

    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(host.modal().props.visible).toBe(true);
    host.unmount();
  });

  it('does not hide a dialog that is still fading in (onShow arrives ~0.7s after presenting)', () => {
    const host = renderHost();
    act(() => {
      void presentDisclosure(request);
    });
    act(() => {
      jest.advanceTimersByTime(700);
    });
    expect(host.modal().props.visible).toBe(true);
    act(() => {
      host.modal().props.onShow();
      jest.advanceTimersByTime(DIALOG_PRESENT_RETRY_MS * 2);
    });
    expect(host.modal().props.visible).toBe(true);
    host.unmount();
  });

  it('leaves a dialog alone once it is shown, and answers the caller', async () => {
    const host = renderHost();
    let answer!: Promise<boolean> | null;
    act(() => {
      answer = presentDisclosure(request);
    });
    act(() => {
      host.modal().props.onShow();
      jest.advanceTimersByTime(DIALOG_PRESENT_RETRY_MS * 3);
    });
    expect(host.modal().props.visible).toBe(true);

    const allow = host.modal().findAll((node) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function')
      .find((node) => node.findAll((child) => child.props.children === 'Allow').length > 0);
    act(() => {
      allow!.props.onPress();
    });
    await expect(answer).resolves.toBe(true);
    expect(host.modal().props.visible).toBe(false);
    host.unmount();
  });
});
