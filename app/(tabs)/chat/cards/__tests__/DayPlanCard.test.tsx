import React from 'react';
import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import { DayPlanCard } from '../DayPlanCard';

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  const { Text: MockText } = require('react-native');
  function MockMaterialCommunityIcon({ name }: { name: string }) {
    return <MockText>{name}</MockText>;
  }
  MockMaterialCommunityIcon.displayName = 'MockMaterialCommunityIcon';
  return MockMaterialCommunityIcon;
});

jest.mock('@react-native-community/datetimepicker', () => {
  const { View: MockView } = require('react-native');
  function MockDateTimePicker() {
    return <MockView />;
  }
  MockDateTimePicker.displayName = 'MockDateTimePicker';
  return MockDateTimePicker;
});

const hasText = (tree: renderer.ReactTestRenderer, value: string) =>
  tree.root.findAllByType(Text).some((node) => {
    const children = Array.isArray(node.props.children) ? node.props.children.join('') : node.props.children;
    return children === value;
  });

describe('DayPlanCard', () => {
  it('hides existing blocker rows from the visible timeline', async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <DayPlanCard
          draftId="draft-1"
          date="2026-03-18"
          calendarItems={[]}
          todoItems={[
            {
              text: 'Write proposal',
              dueDate: '2026-03-18T09:00:00.000Z',
              hasDueTime: true,
              starred: false,
              priority: 'medium',
              durationMinutes: 60,
            },
          ]}
          timelineItems={[
            {
              id: 'draft-task',
              kind: 'task',
              source: 'draft',
              title: 'Write proposal',
              dueDate: '2026-03-18T09:00:00.000Z',
              hasDueTime: true,
              durationMinutes: 60,
              timeSource: 'ai',
              priority: 'medium',
            },
            {
              id: 'existing-lunch',
              kind: 'blocker',
              source: 'existing',
              title: 'Lunch',
              start: '2026-03-18T12:00:00.000Z',
              end: '2026-03-18T13:00:00.000Z',
              durationMinutes: 60,
              timeSource: 'user',
            },
          ]}
        />
      );
    });

    expect(hasText(tree!, 'Write proposal')).toBe(true);
    expect(hasText(tree!, 'Lunch')).toBe(false);
    expect(hasText(tree!, 'Existing')).toBe(false);
  });

  it('does not show save action for hidden buffer-only plans', async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <DayPlanCard
          draftId="draft-1"
          date="2026-03-18"
          calendarItems={[]}
          todoItems={[]}
          timelineItems={[
            {
              id: 'transition',
              kind: 'buffer',
              source: 'draft',
              title: 'Transition time',
              durationMinutes: 30,
              timeSource: 'none',
              hidden: true,
            },
          ]}
          onSave={jest.fn()}
        />
      );
    });

    expect(hasText(tree!, 'Save plan')).toBe(false);
    expect(hasText(tree!, 'Nothing in this plan yet.')).toBe(true);
  });
});
