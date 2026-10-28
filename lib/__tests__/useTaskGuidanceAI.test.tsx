import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useTaskGuidanceAI } from '@/lib/useTaskGuidanceAI';
import {
  requestTaskGuidance,
  requestTaskGuidanceAnswer,
  saveTaskGuide,
  type TaskGuide,
} from '@/lib/taskGuidance';

jest.mock('@/lib/taskGuidance', () => ({
  requestTaskGuidance: jest.fn(),
  requestTaskGuidanceAnswer: jest.fn(),
  saveTaskGuide: jest.fn(),
}));

const baseGuide: TaskGuide = {
  id: 'guide-1',
  todoId: 'todo-1',
  status: 'accepted',
  activeStepIndex: 0,
  note: 'Original plan.',
  steps: [
    { title: 'Draft outline', details: 'Write sections.', completed: false },
    { title: 'Publish', details: 'Ship it.', completed: false },
  ],
  conversation: [],
  createdAt: new Date('2026-05-04T00:00:00Z'),
};

describe('useTaskGuidanceAI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (saveTaskGuide as jest.Mock).mockImplementation(async (input) => ({
      ...baseGuide,
      ...input,
      id: baseGuide.id,
      createdAt: baseGuide.createdAt,
      steps: input.steps ?? baseGuide.steps,
      conversation: input.conversation ?? baseGuide.conversation,
      activeStepIndex: input.activeStepIndex ?? baseGuide.activeStepIndex,
      status: input.status ?? baseGuide.status,
    }));
  });

  it('continues accepted plan changes through clarification answers', async () => {
    (requestTaskGuidance as jest.Mock)
      .mockResolvedValueOnce({
        type: 'clarify',
        question: 'How short should each step be?',
        steps: [],
      })
      .mockResolvedValueOnce({
        type: 'plan',
        note: 'Updated plan.',
        steps: [{ title: 'Draft for 10 minutes', details: 'Stop when the timer ends.' }],
      });

    let hook!: ReturnType<typeof useTaskGuidanceAI>;
    const Harness = () => {
      hook = useTaskGuidanceAI({
        context: { todoId: 'todo-1', title: 'Build portfolio site' },
        guide: baseGuide,
      });
      return null;
    };

    await act(async () => {
      TestRenderer.create(<Harness />);
    });

    await act(async () => {
      await hook.submitText('make the steps shorter');
    });
    await act(async () => {
      await hook.submitText('10 minutes each');
    });

    expect(requestTaskGuidance).toHaveBeenCalledTimes(2);
    expect(requestTaskGuidanceAnswer).not.toHaveBeenCalled();
    expect((requestTaskGuidance as jest.Mock).mock.calls[1][0].conversation).toEqual([
      { role: 'user', content: 'make the steps shorter' },
      { role: 'assistant', content: 'How short should each step be?' },
      { role: 'user', content: '10 minutes each' },
    ]);
  });
});
