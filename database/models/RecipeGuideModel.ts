import { Model } from '@nozbe/watermelondb';
import { date, field, readonly, text } from '@nozbe/watermelondb/decorators';

export default class RecipeGuideModel extends Model {
  static table = 'recipe_guides';

  // @ts-ignore
  @text('todo_id') todoId!: string;
  // @ts-ignore
  @text('answers_json') answersJson!: string;
  // @ts-ignore
  @text('videos_json') videosJson!: string;
  // @ts-ignore
  @text('selected_video_json') selectedVideoJson!: string;
  // @ts-ignore
  @text('ingredients_json') ingredientsJson!: string;
  // @ts-ignore
  @text('equipment_json') equipmentJson!: string;
  // @ts-ignore
  @text('steps_json') stepsJson!: string;
  // @ts-ignore
  @text('conversation_json') conversationJson!: string;
  // @ts-ignore
  @field('active_step_index') activeStepIndex!: number;
  // @ts-ignore
  @text('status') status!: 'questions' | 'videos' | 'generating' | 'ready' | 'error';
  // @ts-ignore
  @text('error_message') errorMessage?: string;
  // @ts-ignore
  @text('transcript_language') transcriptLanguage?: string;
  // @ts-ignore
  @readonly @date('created_at') createdAt!: Date;
  // @ts-ignore
  @readonly @date('updated_at') updatedAt!: Date;
}
