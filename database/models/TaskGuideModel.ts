import { Model } from '@nozbe/watermelondb';
import { date, field, readonly, text } from '@nozbe/watermelondb/decorators';

export default class TaskGuideModel extends Model {
  static table = 'task_guides';

  // @ts-ignore
  @text('todo_id') todoId!: string;
  // @ts-ignore
  @text('steps_json') stepsJson!: string;
  // @ts-ignore
  @text('conversation_json') conversationJson!: string;
  // @ts-ignore
  @field('active_step_index') activeStepIndex!: number;
  // @ts-ignore
  @text('status') status!: 'preview' | 'accepted' | 'complete' | 'error';
  // @ts-ignore
  @text('note') note?: string;
  // @ts-ignore
  @text('error_message') errorMessage?: string;
  // @ts-ignore
  @readonly @date('created_at') createdAt!: Date;
  // @ts-ignore
  @readonly @date('updated_at') updatedAt!: Date;
}
