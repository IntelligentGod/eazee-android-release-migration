import { Model } from "@nozbe/watermelondb";
import { date, field, readonly, text } from "@nozbe/watermelondb/decorators";

/**
 * A calendar event that repeats every week. Its occurrences are ordinary rows in
 * `events` (linked by `series_id`), created a few weeks ahead by lib/eventSeries.ts.
 */
export default class EventSeriesModel extends Model {
  static table = "event_series";

  // @ts-ignore
  @text("title") title!: string;
  // @ts-ignore
  @text("details") details?: string | null;
  // @ts-ignore
  @text("location") location?: string | null;
  /** Start and end of the first occurrence; every later one keeps the same weekday and clock time. */
  // @ts-ignore
  @date("start_date") startDate!: Date;
  // @ts-ignore
  @date("end_date") endDate!: Date;
  // @ts-ignore
  @field("active") active!: boolean;
  /** Start of the latest occurrence row created so far; new rows are only added after it. */
  // @ts-ignore
  @date("last_occurrence_start") lastOccurrenceStart!: Date;
  /** The weekly repeating event on Google Calendar, when Google was connected. */
  // @ts-ignore
  @text("google_event_id") googleEventId?: string | null;
  // @ts-ignore
  @readonly @date("created_at") createdAt!: Date;
  // @ts-ignore
  @readonly @date("updated_at") updatedAt!: Date;
}
