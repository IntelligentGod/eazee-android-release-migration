import {
  getCompactNoticeTargetForAppScreen,
  getCompactNoticeTargetForMutation,
} from '../compactAiNoticeTargets';

describe('compact AI helpers', () => {
  it('builds an app screen target for compact navigation shortcuts', () => {
    expect(getCompactNoticeTargetForAppScreen({
      route: '/(tabs)/home',
      params: {
        manageAccount: 'true',
        manageAccountSection: 'country',
      },
    })).toEqual({
      type: 'screen',
      route: '/(tabs)/home',
      params: {
        manageAccount: 'true',
        manageAccountSection: 'country',
      },
    });
  });

  it('builds a todo target when exactly one todo is created', () => {
    expect(getCompactNoticeTargetForMutation('todo_create_many', {
      createdItems: [
        {
          id: 'todo_1',
          text: 'Pick up milk',
          workspace: 'Personal',
        },
      ],
    })).toEqual({
      type: 'todo',
      todoId: 'todo_1',
      workspaceKey: 'Personal',
    });
  });

  it('does not build a target when multiple todos are created', () => {
    expect(getCompactNoticeTargetForMutation('todo_create_many', {
      createdItems: [
        { id: 'todo_1', text: 'Pick up milk', workspace: 'Personal' },
        { id: 'todo_2', text: 'Book dentist', workspace: 'Work' },
      ],
    })).toBeNull();
  });

  it('builds an event target for a created calendar event', () => {
    expect(getCompactNoticeTargetForMutation('calendar_create', {
      item: {
        id: 'evt_1',
        title: 'Standup',
        startDate: '2026-04-01T09:00:00.000Z',
        source: 'local',
        googleEventId: 'google_evt_1',
      },
    })).toEqual({
      type: 'event',
      eventId: 'evt_1',
      source: 'local',
      startDate: '2026-04-01T09:00:00.000Z',
      googleEventId: 'google_evt_1',
    });
  });
});
