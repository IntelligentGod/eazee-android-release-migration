import { Model } from "@nozbe/watermelondb";
import { field, date, text, readonly } from "@nozbe/watermelondb/decorators";
import type { TodoReminderMode } from "@/utils/todoReminders";
import type { GoalTodoTimeframe } from "@/utils/goalTimeframes";
import type { GuidancePath, TodoTaskKind } from "@/lib/todoClassification";

export default class TodoModel extends Model {
  static table = "todos";

  // @ts-ignore
  @text("text") text!: string;
  // @ts-ignore
  @field("completed") completed!: boolean;
  // @ts-ignore
  @text("details") details?: string;
  // @ts-ignore
  @date("due_date") dueDate?: Date;
  // @ts-ignore
  @field("has_due_time") hasDueTime!: boolean;
  // @ts-ignore
  @field("starred") starred!: boolean;
  // @ts-ignore
  @text("workspace") workspace!: string;
  // @ts-ignore
  @text("amazon_url") amazonUrl?: string;
  // @ts-ignore
  @field("is_amazon_url_loaded") isAmazonUrlLoaded!: boolean;
  // @ts-ignore
  @field("amazon_url_load_attempts") amazonUrlLoadAttempts!: number;
  // @ts-ignore
  @readonly @date("created_at") createdAt!: Date;
  // @ts-ignore
  @readonly @date("updated_at") updatedAt!: Date;
  // @ts-ignore
  @text("sort_scope") sortScope?: string | null;
  // @ts-ignore
  @field("sort_order") sortOrder?: number | null;
  // @ts-ignore
  @field("planned_duration_minutes") plannedDurationMinutes?: number | null;
  // @ts-ignore
  @text("recurrence_series_id") recurrenceSeriesId?: string | null;
  // @ts-ignore
  @date("recurrence_occurrence_date") recurrenceOccurrenceDate?: Date | null;
  // @ts-ignore
  @field("recurrence_override") recurrenceOverride?: boolean | null;
  // @ts-ignore
  @text("email_id") emailId?: string;
  // @ts-ignore
  @text('type') type!: 'basic' | 'progress' | 'slider';
  // @ts-ignore
  @date('started_at') startedAt?: Date;
  // @ts-ignore
  @field('progress') progress?: number; // 0 to 1
  // @ts-ignore
  @field('reminder_enabled') reminderEnabled!: boolean;
  // @ts-ignore
  @text('reminder_mode') reminderMode?: TodoReminderMode | null;
  // @ts-ignore
  @field('reminder_minutes_before') reminderMinutesBefore?: number | null;
  // @ts-ignore
  @text('notification_id') notificationId?: string | null;
  // @ts-ignore
  @text('goal_timeframe') goalTimeframe?: GoalTodoTimeframe | null;
  // @ts-ignore
  @text('task_kind') taskKind?: TodoTaskKind | null;
  // @ts-ignore
  @text('guidance_path') guidancePath?: GuidancePath | null;
  // @ts-ignore
  @text('goal_behavior_json') goalBehaviorJson?: string | null;
}
