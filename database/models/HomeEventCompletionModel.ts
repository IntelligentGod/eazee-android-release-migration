import { Model } from '@nozbe/watermelondb';
import { date, text } from '@nozbe/watermelondb/decorators';

export default class HomeEventCompletionModel extends Model {
  static table = 'home_event_completions';

  // @ts-ignore
  @text('event_source') eventSource!: 'local' | 'google';
  // @ts-ignore
  @text('event_key') eventKey!: string;
  // @ts-ignore
  @date('occurrence_start') occurrenceStart!: Date;
  // @ts-ignore
  @date('completed_at') completedAt!: Date;
}
