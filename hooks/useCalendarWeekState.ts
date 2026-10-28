import { useEffect, useMemo, useRef, useState } from 'react';

import {
  getAdjacentCalendarWeekStarts,
  getCalendarWeekKey,
  normalizeCalendarWeekStart,
} from '@/utils/calendarWeeks';

export function useCalendarWeekState(onWeekStartChange?: () => void) {
  const [weekStart, setWeekStart] = useState(() => {
    const today = new Date();
    return normalizeCalendarWeekStart(today);
  });
  const weekStartRef = useRef(weekStart);
  const currentWeekKey = useMemo(() => getCalendarWeekKey(weekStart), [weekStart]);
  const [pagerWeekStart, setPagerWeekStart] = useState(weekStart);
  const [pagerResetWeekStart, setPagerResetWeekStart] = useState<Date | null>(null);
  const [programmaticWeekStarts, setProgrammaticWeekStarts] = useState<Date[] | null>(null);
  const visibleWeekStarts = useMemo(() => getAdjacentCalendarWeekStarts(pagerWeekStart), [pagerWeekStart]);
  const activeVisibleWeekStarts = programmaticWeekStarts ?? visibleWeekStarts;

  useEffect(() => {
    weekStartRef.current = weekStart;
    onWeekStartChange?.();
  }, [onWeekStartChange, weekStart]);

  return {
    weekStart,
    setWeekStart,
    weekStartRef,
    currentWeekKey,
    pagerWeekStart,
    setPagerWeekStart,
    pagerResetWeekStart,
    setPagerResetWeekStart,
    programmaticWeekStarts,
    setProgrammaticWeekStarts,
    visibleWeekStarts,
    activeVisibleWeekStarts,
  };
}
