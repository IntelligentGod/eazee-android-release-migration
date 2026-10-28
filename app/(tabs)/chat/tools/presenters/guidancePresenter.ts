import type { AssistantMessage } from '../types';
import { appendCreatedTodoItems, setLastQueryItems } from '../memory';

const toCardItem = (item: any) => ({
  id: String(item?.id || ''),
  text: String(item?.text || ''),
  dueDate: typeof item?.dueDate === 'string' ? item.dueDate : null,
  hasDueTime: typeof item?.hasDueTime === 'boolean' ? item.hasDueTime : undefined,
  completed: typeof item?.completed === 'boolean' ? item.completed : undefined,
  workspace: typeof item?.workspace === 'string' ? item.workspace : undefined,
  starred: typeof item?.starred === 'boolean' ? item.starred : undefined,
});

const guideLabel = (value: unknown) => {
  if (value === 'recipe') return 'recipe guide';
  if (value === 'skill') return 'skill guide';
  if (value === 'task') return 'task guide';
  return 'goal plan';
};

const formatGuidanceStepLine = (step: any) => {
  const title = String(step?.title || 'Step');
  const details = typeof step?.details === 'string' && step.details.trim()
    ? `\n   ${step.details.trim().replace(/\n+/g, '\n   ')}`
    : '';
  const suffix = step?.completed ? ' (done)' : step?.isCurrent ? ' (current)' : '';
  return `${String(step?.stepNumber || '?')}. ${title}${suffix}${details}`;
};

const progressLabel = (result: any) => {
  const totalSteps = Number(result?.totalSteps || 0);
  if (!totalSteps) return '';
  const completedSteps = Math.min(Math.max(Number(result?.completedSteps || 0), 0), totalSteps);
  return ` (${completedSteps}/${totalSteps} done)`;
};

export function presentGuidanceResult(name: string, result: any): { messages: AssistantMessage[] } {
  if (name === 'goal_create') {
    const createdItems = Array.isArray(result?.createdItems) ? result.createdItems : [];
    const itemsForCard = createdItems.map(toCardItem);
    if (itemsForCard.length) {
      setLastQueryItems(itemsForCard);
      appendCreatedTodoItems(itemsForCard);
      return {
        messages: [{ role: 'assistant', content: 'Your goal has been added. Open it in Todo to make guidance.', card: { type: 'todoCreated', items: itemsForCard, showGoalSuggestionsOnOpen: true } }],
      };
    }
    if (result?.error === 'CLASSIFICATION_FAILED') {
      return {
        messages: [{ role: 'assistant', content: 'I could not classify that goal, so I did not add it. Try again from chat or add it from Todo.' }],
      };
    }
    return { messages: [{ role: 'assistant', content: 'I could not add that goal.' }] };
  }

  if (name === 'goal_create_with_guidance') {
    const createdItems = Array.isArray(result?.createdItems) ? result.createdItems : [];
    const itemsForCard = createdItems.map(toCardItem);
    if (itemsForCard.length) {
      setLastQueryItems(itemsForCard);
      appendCreatedTodoItems(itemsForCard);
      if (result?.guidancePath === 'actions') {
        const totalSteps = Number(result?.guide?.totalSteps || 0);
        const actionItems = Array.isArray(result?.actionItems) ? result.actionItems : [];
        const goalBehavior = result?.goalBehavior;
        if (goalBehavior?.kind === 'quota') {
          return {
            messages: [{
              role: 'assistant',
              content: totalSteps > 0
                ? `Your quota goal has been added with an actions plan. When do you want to do the first one?`
                : `Your quota goal has been added. When do you want to do the first one?`,
              card: {
                type: 'goalQuotaSchedule',
                goal: itemsForCard[0],
                planId: result?.guide?.id,
                goalBehavior,
              },
            }],
          };
        }
        const actionSuffix = actionItems.length ? ' First action is in Personal for today.' : '';
        return {
          messages: [{
            role: 'assistant',
            content: totalSteps > 0
              ? `Your goal has been added with an actions plan (${totalSteps} steps).${actionSuffix}`
              : `Your goal has been added with an actions plan.${actionSuffix}`,
            card: { type: 'todoCreated', items: itemsForCard, showGoalSuggestionsOnOpen: true },
          }],
        };
      }

      const videoCount = Number(result?.videoCount || 0);
      const guideLabel = result?.guideType === 'recipe' ? 'recipe videos' : 'video lessons';
      return {
        messages: [{
          role: 'assistant',
          content: videoCount > 0
            ? `Your goal has been added with ${videoCount} ${guideLabel} to choose from.`
            : String(result?.message || 'Your goal has been added, but I could not find videos yet. Open it in Todo to retry.'),
          card: { type: 'todoCreated', items: itemsForCard, showGoalSuggestionsOnOpen: true },
        }],
      };
    }

    if (result?.error === 'CLASSIFICATION_FAILED') {
      return {
        messages: [{ role: 'assistant', content: 'I could not classify that goal, so I did not add it. Try again from chat or add it from Todo.' }],
      };
    }
    if (result?.error === 'VIDEO_GUIDANCE_UNSUPPORTED') {
      return {
        messages: [{ role: 'assistant', content: String(result?.message || 'Video guidance is only available for recipe or skill goals.') }],
      };
    }
    return {
      messages: [{ role: 'assistant', content: String(result?.message || 'I could not add that goal with guidance.') }],
    };
  }

  if (name === 'goal_query') {
    const items = Array.isArray(result?.items) ? result.items.map(toCardItem) : [];
    const totalMatches = Number.isFinite(Number(result?.totalMatches))
      ? Number(result.totalMatches)
      : items.length;
    setLastQueryItems(items);
    if (!items.length) {
      return { messages: [{ role: 'assistant', content: "I couldn't find any matching todo-tab goals." }] };
    }
    if (result?.openIntent === true && totalMatches === 1 && items.length === 1) {
      const item = items[0];
      const label = item.text || 'goal';
      return {
        messages: [{
          role: 'assistant',
          content: `I found “${label}”.`,
          card: {
            type: 'navigationShortcut',
            label,
            route: '/(tabs)/todo',
            params: {
              workspaceKey: 'Goals',
              openTodoId: item.id,
              openTodoNonce: String(Date.now()),
            },
            target: {
              type: 'todo',
              todoId: item.id,
              workspaceKey: 'Goals',
            },
          },
        }],
      };
    }
    return {
      messages: [{
        role: 'assistant',
        content: items.length === 1 ? 'I found 1 todo-tab goal.' : `I found ${items.length} todo-tab goals.`,
        card: { type: 'todoQuery', items },
      }],
    };
  }

  if (name === 'guidance_current_step') {
    const todo = result?.todo ? toCardItem(result.todo) : null;
    if (!result?.found) {
      return {
        messages: [{
          role: 'assistant',
          content: String(result?.message || 'No saved guidance is ready for this item. Open it in Todo to set up guidance.'),
          ...(todo ? { card: { type: 'todoQuery', items: [todo] } } : {}),
        }],
      };
    }
    const scope = result?.scope === 'next' || result?.scope === 'all' ? result.scope : 'current';
    const steps = Array.isArray(result?.steps) ? result.steps : [];
    if (scope === 'next') {
      const content = steps.length
        ? `Next ${guideLabel(result?.guideType)} steps${progressLabel(result)}:\n${steps.map(formatGuidanceStepLine).join('\n')}`
        : `There are no later ${guideLabel(result?.guideType)} steps after the current one.`;
      return {
        messages: [{
          role: 'assistant',
          content,
          ...(todo ? { card: { type: 'todoQuery', items: [todo] } } : {}),
        }],
      };
    }
    if (scope === 'all') {
      const content = steps.length
        ? `All ${guideLabel(result?.guideType)} steps${progressLabel(result)}:\n${steps.map(formatGuidanceStepLine).join('\n')}`
        : `No saved ${guideLabel(result?.guideType)} steps found.`;
      return {
        messages: [{
          role: 'assistant',
          content,
          ...(todo ? { card: { type: 'todoQuery', items: [todo] } } : {}),
        }],
      };
    }
    const step = result?.currentStep || {};
    const details = typeof step.details === 'string' && step.details.trim() ? `\n${step.details.trim()}` : '';
    return {
      messages: [{
        role: 'assistant',
        content: `Current ${guideLabel(result?.guideType)} step${progressLabel(result)}: ${String(step.title || 'Step')}.${details}`,
        ...(todo ? { card: { type: 'todoQuery', items: [todo] } } : {}),
      }],
    };
  }

  if (name === 'guidance_answer') {
    const todo = result?.todo ? toCardItem(result.todo) : null;
    return {
      messages: [{
        role: 'assistant',
        content: result?.found
          ? String(result?.answer || 'I could not answer that yet.')
          : String(result?.message || 'No saved guidance is ready for this item. Open it in Todo to set up guidance.'),
        ...(todo ? { card: { type: 'todoQuery', items: [todo] } } : {}),
      }],
    };
  }

  return { messages: [{ role: 'assistant', content: 'Done.' }] };
}
