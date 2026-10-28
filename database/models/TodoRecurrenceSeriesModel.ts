import { Model } from "@nozbe/watermelondb";
import { date, field, readonly, text } from "@nozbe/watermelondb/decorators";
import type { TodoRecurrenceUnit } from "@/lib/todoRecurrence";

export default class TodoRecurrenceSeriesModel extends Model {
  static table = "todo_recurrence_series";

  // @ts-ignore
  @text("unit") unit!: TodoRecurrenceUnit;
  // @ts-ignore
  @field("interval") interval!: number;
  // @ts-ignore
  @date("start_date") startDate!: Date;
  // @ts-ignore
  @field("anchor_day") anchorDay?: number | null;
  // @ts-ignore
  @field("active") active!: boolean;
  // @ts-ignore
  @text("skipped_dates_json") skippedDatesJson?: string | null;
  // @ts-ignore
  @readonly @date("created_at") createdAt!: Date;
  // @ts-ignore
  @readonly @date("updated_at") updatedAt!: Date;
}
