import { Model } from '@nozbe/watermelondb';
import { date, field, readonly, text } from '@nozbe/watermelondb/decorators';

export default class GoalGuidancePlanModel extends Model {
  static table = 'goal_guidance_plans';

  // @ts-ignore
  @text('goal_id') goalId!: string;
  // @ts-ignore
  @text('timeframe') timeframe!: 'thisWeek' | 'thisMonth' | 'thisYear' | 'longTerm';
  // @ts-ignore
  @date('deadline') deadline!: Date;
  // @ts-ignore
  @text('feasibility_status') feasibilityStatus!: 'realistic' | 'tight' | 'unrealistic';
  // @ts-ignore
  @text('feasibility_note') feasibilityNote!: string;
  // @ts-ignore
  @text('alternative_suggestion') alternativeSuggestion?: string;
  // @ts-ignore
  @text('steps_json') stepsJson!: string;
  // @ts-ignore
  @field('active_step_index') activeStepIndex!: number;
  // @ts-ignore
  @text('active_todo_id') activeTodoId?: string;
  // @ts-ignore
  @text('active_actions_json') activeActionsJson?: string;
  // @ts-ignore
  @text('completed_step_indexes_json') completedStepIndexesJson?: string;
  // @ts-ignore
  @text('status') status!: 'preview' | 'accepted' | 'complete';
  // @ts-ignore
  @field('cram') cram!: boolean;
  // @ts-ignore
  @text('conversation_json') conversationJson!: string;
  // @ts-ignore
  @readonly @date('created_at') createdAt!: Date;
  // @ts-ignore
  @readonly @date('updated_at') updatedAt!: Date;
}
