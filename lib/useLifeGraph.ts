import { Q } from '@nozbe/watermelondb';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { database } from '@/database/database';
import type TodoModel from '@/database/models/TodoModel';
import {
  DEFAULT_LIFE_GRAPH_SETTINGS,
  computeLifeGraphProgress,
  getLifeGraphLobeStrengths,
  getLifeGraphWeekStart,
  readLifeGraphSettings,
  writeLifeGraphSettings,
  type LifeGraphCompletedTask,
  type LifeGraphSettings,
} from '@/lib/lifeGraph';
import { getTodoOrderingWeekStartsOnFromLocale } from '@/lib/todoOrdering';

/**
 * Settings are per user; progress follows the todo table live so a task
 * completed on another tab grows the Droplet without a Home refresh.
 */
export function useLifeGraph(userId?: string | null) {
  const [settings, setSettings] = useState<LifeGraphSettings>(DEFAULT_LIFE_GRAPH_SETTINGS);
  const [completedTasks, setCompletedTasks] = useState<LifeGraphCompletedTask[]>([]);
  const weekStart = useMemo(() => getLifeGraphWeekStart(new Date(), getTodoOrderingWeekStartsOnFromLocale()), []);

  useEffect(() => {
    if (!userId) {
      setSettings(DEFAULT_LIFE_GRAPH_SETTINGS);
      return;
    }
    let cancelled = false;
    void readLifeGraphSettings(userId).then((storedSettings) => {
      if (!cancelled) setSettings(storedSettings);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    // Todos have no completion timestamp; the last update of a completed todo is the closest signal.
    const subscription = database
      .get<TodoModel>('todos')
      .query(Q.where('completed', true), Q.where('updated_at', Q.gte(weekStart.getTime())))
      .observeWithColumns(['text', 'details', 'updated_at'])
      .subscribe((todos) => {
        setCompletedTasks(todos.map((todo) => ({ text: todo.text, details: todo.details, completedAt: todo.updatedAt })));
      });
    return () => subscription.unsubscribe();
  }, [weekStart]);

  const saveSettings = useCallback((nextSettings: LifeGraphSettings) => {
    setSettings(nextSettings);
    if (userId) void writeLifeGraphSettings(userId, nextSettings);
  }, [userId]);

  const progress = useMemo(
    () => computeLifeGraphProgress(settings, completedTasks, weekStart),
    [completedTasks, settings, weekStart]
  );
  const lobeStrengths = useMemo(() => getLifeGraphLobeStrengths(settings, progress), [progress, settings]);

  return { settings, saveSettings, progress, lobeStrengths };
}
