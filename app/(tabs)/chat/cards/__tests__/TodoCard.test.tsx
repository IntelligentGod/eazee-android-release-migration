import React from 'react';
import renderer, { act } from 'react-test-renderer';

import { TodoCard } from '../TodoCard';

jest.mock('@/components/guidance/GuidanceProvider', () => ({
  useGuidance: () => ({ startGuidance: jest.fn() }),
}));

jest.mock('@/lib/useNavigationHelpMode', () => ({
  useNavigationHelpMode: () => ({ mode: 'shortcut' }),
}));

jest.mock('@/lib/handleNavigationHelpTarget', () => ({
  handleNavigationHelpTarget: jest.fn(),
}));

describe('TodoCard', () => {
  it('shows a buy button for wishlist items and calls the buy handler', async () => {
    const push = jest.fn();
    const onBuyWishlistItem = jest.fn();
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <TodoCard
          items={[{ id: 'wish-1', text: 'Headphones', workspace: 'Wishlist' }]}
          router={{ push } as any}
          onBuyWishlistItem={onBuyWishlistItem}
        />
      );
    });

    const buyButton = tree!.root.findByProps({ accessibilityLabel: 'Buy wishlist item' });

    act(() => {
      buyButton.props.onPress();
    });

    expect(onBuyWishlistItem).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'wish-1', text: 'Headphones', workspace: 'Wishlist' })
    );
  });

  it('does not show a buy button for non-wishlist items', async () => {
    const push = jest.fn();
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <TodoCard
          items={[{ id: 'todo-1', text: 'Call Sam', workspace: 'Personal' }]}
          router={{ push } as any}
        />
      );
    });

    expect(() => tree!.root.findByProps({ accessibilityLabel: 'Buy wishlist item' })).toThrow();
  });

  it('shows only an icon marker for repeating todos', async () => {
    const push = jest.fn();
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <TodoCard
          items={[{ id: 'todo-1', text: 'Stretch', workspace: 'Personal', recurrence: 'Recurring' }]}
          router={{ push } as any}
        />
      );
    });

    expect(tree!.root.findByProps({ accessibilityLabel: 'Repeating todo' })).toBeTruthy();
    expect(() => tree!.root.findByProps({ children: 'Recurring' })).toThrow();
  });
});
