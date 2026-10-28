import {
  createQuotaGoalBehavior,
  getGoalQuotaActionTitle,
  parseGoalBehavior,
  serializeGoalBehavior,
} from '@/lib/goalBehavior';

describe('goal quota behavior', () => {
  it('serializes quota metadata and renders distinct day titles', () => {
    const behavior = createQuotaGoalBehavior({
      targetCount: 3,
      completedCount: 1,
      unitLabel: 'days',
      unitType: 'distinct_days',
    });
    const parsed = parseGoalBehavior(serializeGoalBehavior({
      ...behavior,
      actionTemplateTitle: 'Fast',
    }));

    expect(parsed).toMatchObject({
      kind: 'quota',
      targetCount: 3,
      completedCount: 1,
      unitLabel: 'days',
      unitType: 'distinct_days',
    });
    expect(parsed?.kind === 'quota' ? getGoalQuotaActionTitle(parsed, 'Fallback') : '').toBe('Fast - Day 2 of 3');
  });

  it('renders count quota titles without day wording', () => {
    const behavior = createQuotaGoalBehavior({
      targetCount: 40,
      completedCount: 7,
      unitLabel: 'times',
      unitType: 'count',
    });

    expect(getGoalQuotaActionTitle({ ...behavior, actionTemplateTitle: 'Workout' }, 'Fallback')).toBe('Workout - 8 of 40');
  });

  it('preserves full quota action template details when parsing', () => {
    const longDetails = 'Repeat this action with enough detail to stay useful after reload, including setup, execution, and completion notes.';
    const behavior = createQuotaGoalBehavior({
      targetCount: 2,
      unitLabel: 'times',
      unitType: 'count',
    });

    const parsed = parseGoalBehavior(serializeGoalBehavior({
      ...behavior,
      actionTemplateDetails: longDetails,
    }));

    expect(parsed?.kind === 'quota' ? parsed.actionTemplateDetails : '').toBe(longDetails);
  });
});
