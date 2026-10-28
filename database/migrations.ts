import { schemaMigrations, addColumns, createTable, unsafeExecuteSql } from '@nozbe/watermelondb/Schema/migrations';

export default schemaMigrations({
  migrations: [
    {
      toVersion: 55,
      steps: [
        addColumns({
          table: 'user_preferences',
          columns: [
            { name: 'display_name', type: 'string', isOptional: true },
            { name: 'original_name', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 56,
      steps: [
        createTable({
          name: 'chat_sessions',
          columns: [
            { name: 'title', type: 'string' },
            { name: 'summary', type: 'string', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
        createTable({
          name: 'chat_messages',
          columns: [
            { name: 'session_id', type: 'string', isIndexed: true },
            { name: 'role', type: 'string' },
            { name: 'content', type: 'string', isOptional: true },
            { name: 'card_json', type: 'string', isOptional: true },
            { name: 'created_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 57,
      steps: [
        addColumns({
          table: 'chat_sessions',
          columns: [
            { name: 'pinned', type: 'boolean' },
          ],
        }),
      ],
    },
    {
      toVersion: 58,
      steps: [
        addColumns({
          table: 'chat_sessions',
          columns: [
            { name: 'last_message_at', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 59,
      steps: [
        addColumns({
          table: 'todos',
          columns: [
            { name: 'has_due_time', type: 'boolean' },
          ],
        }),
      ],
    },
    {
      toVersion: 60,
      steps: [
        addColumns({
          table: 'todos',
          columns: [
            { name: 'reminder_enabled', type: 'boolean', isOptional: true },
            { name: 'reminder_mode', type: 'string', isOptional: true },
            { name: 'reminder_minutes_before', type: 'number', isOptional: true },
            { name: 'notification_id', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 61,
      steps: [
        createTable({
          name: 'home_event_completions',
          columns: [
            { name: 'event_source', type: 'string' },
            { name: 'event_key', type: 'string' },
            { name: 'occurrence_start', type: 'number' },
            { name: 'completed_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 62,
      steps: [
        createTable({
          name: 'goal_guidance_plans',
          columns: [
            { name: 'goal_id', type: 'string', isIndexed: true },
            { name: 'timeframe', type: 'string' },
            { name: 'deadline', type: 'number' },
            { name: 'feasibility_status', type: 'string' },
            { name: 'feasibility_note', type: 'string' },
            { name: 'alternative_suggestion', type: 'string', isOptional: true },
            { name: 'steps_json', type: 'string' },
            { name: 'active_step_index', type: 'number' },
            { name: 'active_todo_id', type: 'string', isOptional: true, isIndexed: true },
            { name: 'status', type: 'string' },
            { name: 'cram', type: 'boolean' },
            { name: 'conversation_json', type: 'string' },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 63,
      steps: [
        addColumns({
          table: 'goal_guidance_plans',
          columns: [
            { name: 'active_actions_json', type: 'string', isOptional: true },
            { name: 'completed_step_indexes_json', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 64,
      steps: [
        addColumns({
          table: 'todos',
          columns: [
            { name: 'goal_timeframe', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 65,
      steps: [
        createTable({
          name: 'recipe_guides',
          columns: [
            { name: 'todo_id', type: 'string', isIndexed: true },
            { name: 'answers_json', type: 'string' },
            { name: 'videos_json', type: 'string' },
            { name: 'selected_video_json', type: 'string' },
            { name: 'ingredients_json', type: 'string' },
            { name: 'equipment_json', type: 'string' },
            { name: 'steps_json', type: 'string' },
            { name: 'conversation_json', type: 'string' },
            { name: 'active_step_index', type: 'number' },
            { name: 'status', type: 'string' },
            { name: 'error_message', type: 'string', isOptional: true },
            { name: 'transcript_language', type: 'string', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 66,
      steps: [
        createTable({
          name: 'task_guides',
          columns: [
            { name: 'todo_id', type: 'string', isIndexed: true },
            { name: 'steps_json', type: 'string' },
            { name: 'conversation_json', type: 'string' },
            { name: 'active_step_index', type: 'number' },
            { name: 'status', type: 'string' },
            { name: 'note', type: 'string', isOptional: true },
            { name: 'error_message', type: 'string', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 67,
      steps: [
        addColumns({
          table: 'todos',
          columns: [
            { name: 'task_kind', type: 'string', isOptional: true },
            { name: 'guidance_path', type: 'string', isOptional: true },
          ],
        }),
        createTable({
          name: 'skill_guides',
          columns: [
            { name: 'todo_id', type: 'string', isIndexed: true },
            { name: 'videos_json', type: 'string' },
            { name: 'selected_video_json', type: 'string' },
            { name: 'steps_json', type: 'string' },
            { name: 'conversation_json', type: 'string' },
            { name: 'active_step_index', type: 'number' },
            { name: 'status', type: 'string' },
            { name: 'error_message', type: 'string', isOptional: true },
            { name: 'transcript_language', type: 'string', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 68,
      steps: [
        unsafeExecuteSql('create index if not exists "events_start_date" on "events" ("start_date");'),
        unsafeExecuteSql('create index if not exists "events_end_date" on "events" ("end_date");'),
      ],
    },
    {
      toVersion: 69,
      steps: [
        addColumns({
          table: 'events',
          columns: [
            { name: 'source_todo_id', type: 'string', isOptional: true, isIndexed: true },
          ],
        }),
      ],
    },
    {
      toVersion: 70,
      steps: [
        addColumns({
          table: 'todos',
          columns: [
            { name: 'sort_scope', type: 'string', isOptional: true },
            { name: 'sort_order', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 71,
      steps: [
        addColumns({
          table: 'todos',
          columns: [
            { name: 'goal_behavior_json', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 72,
      steps: [
        addColumns({
          table: 'events',
          columns: [
            { name: 'details', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 73,
      steps: [
        addColumns({
          table: 'chat_sessions',
          columns: [
            { name: 'title_manually_set', type: 'boolean', isOptional: true },
            { name: 'title_generated_at', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 74,
      steps: [
        addColumns({
          table: 'todos',
          columns: [
            { name: 'planned_duration_minutes', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 75,
      steps: [
        addColumns({
          table: 'todos',
          columns: [
            { name: 'recurrence_series_id', type: 'string', isOptional: true, isIndexed: true },
            { name: 'recurrence_occurrence_date', type: 'number', isOptional: true, isIndexed: true },
          ],
        }),
        createTable({
          name: 'todo_recurrence_series',
          columns: [
            { name: 'unit', type: 'string' },
            { name: 'interval', type: 'number' },
            { name: 'start_date', type: 'number' },
            { name: 'anchor_day', type: 'number', isOptional: true },
            { name: 'active', type: 'boolean' },
            { name: 'skipped_dates_json', type: 'string', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 76,
      steps: [
        addColumns({
          table: 'todos',
          columns: [
            { name: 'recurrence_override', type: 'boolean', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 77,
      steps: [
        addColumns({
          table: 'events',
          columns: [
            { name: 'series_id', type: 'string', isOptional: true, isIndexed: true },
          ],
        }),
        createTable({
          name: 'event_series',
          columns: [
            { name: 'title', type: 'string' },
            { name: 'details', type: 'string', isOptional: true },
            { name: 'location', type: 'string', isOptional: true },
            { name: 'start_date', type: 'number' },
            { name: 'end_date', type: 'number' },
            { name: 'active', type: 'boolean' },
            { name: 'last_occurrence_start', type: 'number' },
            { name: 'google_event_id', type: 'string', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
  ],
});
