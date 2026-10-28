import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from 'firebase/auth';

import { database, DEFAULT_DATABASE_NAME, setActiveDatabaseName } from '@/database/database';
import ChatMessageModel from '@/database/models/ChatMessageModel';
import ChatSessionModel from '@/database/models/ChatSessionModel';
import EventModel from '@/database/models/EventModel';
import TodoModel from '@/database/models/TodoModel';
import { getTodoOrderingWeekStartsOnFromLocale, getTodoSortScope, TODO_SORT_ORDER_STEP } from '@/lib/todoOrdering';

const DEMO_SEED_VERSION = 1;
const DEMO_SEED_KEY_PREFIX = `appleReviewDemoSeed:v${DEMO_SEED_VERSION}`;

export type DemoAccountConfig = {
  id: 'primary' | 'backup';
  email: string;
  databaseName: string;
};

export const APPLE_REVIEW_DEMO_ACCOUNTS: DemoAccountConfig[] = [
  {
    id: 'primary',
    email: 'apple-review-1@eazee.app',
    databaseName: 'EazeeAppleReviewPrimary',
  },
  {
    id: 'backup',
    email: 'apple-review-2@eazee.app',
    databaseName: 'EazeeAppleReviewBackup',
  },
];

const normalizeEmail = (email?: string | null) => String(email || '').trim().toLowerCase();

export const getDemoAccountConfig = (email?: string | null) =>
  APPLE_REVIEW_DEMO_ACCOUNTS.find((account) => account.email === normalizeEmail(email)) || null;

export const isAppleReviewDemoAccount = (email?: string | null) =>
  getDemoAccountConfig(email) !== null;

export const getDatabaseNameForAuthUser = (user?: Pick<User, 'email'> | null) =>
  getDemoAccountConfig(user?.email)?.databaseName || DEFAULT_DATABASE_NAME;

export const configureDatabaseForAuthUser = (user?: Pick<User, 'email'> | null) =>
  setActiveDatabaseName(getDatabaseNameForAuthUser(user));

const getSeedStorageKey = (account: DemoAccountConfig) =>
  `${DEMO_SEED_KEY_PREFIX}:${account.id}`;

const atLocalTime = (baseDate: Date, dayOffset: number, hours: number, minutes = 0) =>
  new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate() + dayOffset,
    hours,
    minutes,
    0,
    0
  );

const startOfLocalDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const endOfLoginMonth = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth() + 1, 0);

const hasAnyDemoContent = async () => {
  const [todos, events, chatSessions] = await Promise.all([
    database.collections.get<TodoModel>('todos').query().fetchCount(),
    database.collections.get<EventModel>('events').query().fetchCount(),
    database.collections.get<ChatSessionModel>('chat_sessions').query().fetchCount(),
  ]);

  return todos + events + chatSessions > 0;
};

const seedTodo = async (
  input: {
    text: string;
    details?: string;
    dueDate: Date;
    hasDueTime: boolean;
    workspace: 'Personal' | 'Goals' | 'Wishlist';
    goalTimeframe?: 'thisMonth';
    sortOrder: number;
  },
  now: Date,
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6
) => {
  const sortScope = getTodoSortScope({
    completed: false,
    workspace: input.workspace,
    dueDate: input.dueDate,
    goalTimeframe: input.goalTimeframe,
  }, weekStartsOn, now);

  return database.collections.get<TodoModel>('todos').create((todo) => {
    todo.text = input.text;
    todo.completed = false;
    todo.details = input.details || '';
    todo.dueDate = input.dueDate;
    todo.hasDueTime = input.hasDueTime;
    todo.starred = false;
    todo.workspace = input.workspace;
    todo.goalTimeframe = input.goalTimeframe;
    todo.taskKind = 'normal';
    todo.guidancePath = null;
    todo.goalBehaviorJson = null;
    todo.plannedDurationMinutes = null;
    todo.recurrenceSeriesId = null;
    todo.recurrenceOccurrenceDate = null;
    todo.recurrenceOverride = false;
    todo.sortScope = sortScope;
    todo.sortOrder = input.sortOrder;
    todo.amazonUrl = undefined;
    todo.isAmazonUrlLoaded = false;
    todo.amazonUrlLoadAttempts = 0;
    todo.emailId = undefined;
    todo.type = 'basic';
    todo.startedAt = undefined;
    todo.progress = 0;
    todo.reminderEnabled = false;
    todo.reminderMode = null;
    todo.reminderMinutesBefore = null;
    todo.notificationId = null;
  });
};

const seedDemoData = async () => {
  const now = new Date();
  const loginDay = startOfLocalDay(now);
  const weekStartsOn = getTodoOrderingWeekStartsOnFromLocale();
  const chatTime = atLocalTime(loginDay, 0, 8, 45).getTime();

  await database.write(async () => {
    await seedTodo({
      text: 'Review launch checklist',
      details: 'Check privacy links, account deletion, and demo data before submission.',
      dueDate: atLocalTime(loginDay, 0, 9, 30),
      hasDueTime: true,
      workspace: 'Personal',
      sortOrder: TODO_SORT_ORDER_STEP,
    }, now, weekStartsOn);

    await seedTodo({
      text: 'Prepare weekly priorities',
      details: 'Pick the top three tasks for this week.',
      dueDate: atLocalTime(loginDay, 0, 15),
      hasDueTime: true,
      workspace: 'Personal',
      sortOrder: TODO_SORT_ORDER_STEP * 2,
    }, now, weekStartsOn);

    await seedTodo({
      text: 'Book dentist appointment',
      details: 'Call the clinic and choose an appointment time.',
      dueDate: atLocalTime(loginDay, 1, 0),
      hasDueTime: false,
      workspace: 'Personal',
      sortOrder: TODO_SORT_ORDER_STEP * 3,
    }, now, weekStartsOn);

    await seedTodo({
      text: 'Run a 5K comfortably',
      details: 'Build up to a steady 5K run with short practice sessions.',
      dueDate: endOfLoginMonth(loginDay),
      hasDueTime: false,
      workspace: 'Goals',
      goalTimeframe: 'thisMonth',
      sortOrder: TODO_SORT_ORDER_STEP,
    }, now, weekStartsOn);

    await seedTodo({
      text: 'Noise-cancelling headphones',
      details: 'Compare lightweight options for focus sessions.',
      dueDate: loginDay,
      hasDueTime: false,
      workspace: 'Wishlist',
      sortOrder: TODO_SORT_ORDER_STEP,
    }, now, weekStartsOn);

    await seedTodo({
      text: 'Adjustable desk lamp',
      details: 'Look for warm light and a small desk footprint.',
      dueDate: loginDay,
      hasDueTime: false,
      workspace: 'Wishlist',
      sortOrder: TODO_SORT_ORDER_STEP * 2,
    }, now, weekStartsOn);

    const eventFixtures = [
      {
        title: 'Product planning',
        details: 'Review launch tasks and decide the next milestone.',
        startDate: atLocalTime(loginDay, 0, 11),
        endDate: atLocalTime(loginDay, 0, 11, 45),
      },
      {
        title: 'Focus block',
        details: 'Deep work for the highest priority task.',
        startDate: atLocalTime(loginDay, 0, 14),
        endDate: atLocalTime(loginDay, 0, 15),
      },
      {
        title: 'Coffee with Maya',
        details: 'Catch up and talk through weekend plans.',
        startDate: atLocalTime(loginDay, 1, 10, 30),
        endDate: atLocalTime(loginDay, 1, 11),
      },
    ];

    for (const fixture of eventFixtures) {
      await database.collections.get<EventModel>('events').create((event) => {
        event.title = fixture.title;
        event.details = fixture.details;
        event.startDate = fixture.startDate;
        event.startTime = fixture.startDate.getHours();
        event.endDate = fixture.endDate;
        event.endTime = fixture.endDate.getHours();
        event.createdAt = now;
        event.updatedAt = now;
        event.googleEventId = undefined;
        event.sourceTodoId = undefined;
        event.isGoogleEvent = false;
        event.isTodo = false;
        event.location = undefined;
        event.latitude = undefined;
        event.longitude = undefined;
      });
    }

    const session = await database.collections.get<ChatSessionModel>('chat_sessions').create((record) => {
      record.title = 'Plan a productive day';
      record.summary = 'Demo conversation showing planning, todos, and calendar help.';
      record.pinned = false;
      record.lastMessageAt = chatTime + 180000;
      record.titleManuallySet = true;
      record.titleGeneratedAt = chatTime;
    });

    const messages: { role: 'user' | 'assistant'; content: string; createdAt: number }[] = [
      {
        role: 'user',
        content: 'What does my schedule look like tomorrow?',
        createdAt: chatTime,
      },
      {
        role: 'assistant',
        content: 'Tomorrow you have Coffee with Maya from 10:30 to 11:00 AM, plus Book dentist appointment on your task list.',
        createdAt: chatTime + 60000,
      },
      {
        role: 'user',
        content: 'What tasks should I focus on today?',
        createdAt: chatTime + 120000,
      },
      {
        role: 'assistant',
        content: 'Start with Review launch checklist this morning, then use the afternoon to Prepare weekly priorities before your Focus block ends.',
        createdAt: chatTime + 180000,
      },
    ];

    for (const message of messages) {
      await database.collections.get<ChatMessageModel>('chat_messages').create((record) => {
        record.sessionId = session.id;
        record.role = message.role;
        record.content = message.content;
        record.cardJson = undefined;
        (record as any)._raw.created_at = message.createdAt;
      });
    }
  }, 'seed apple review demo account');
};

export const ensureDemoAccountSeeded = async (account: DemoAccountConfig) => {
  const seedKey = getSeedStorageKey(account);
  const existingMarker = await AsyncStorage.getItem(seedKey);
  if (existingMarker) {
    return;
  }

  if (await hasAnyDemoContent()) {
    await AsyncStorage.setItem(seedKey, JSON.stringify({ seededAt: Date.now(), reusedExistingContent: true }));
    return;
  }

  await seedDemoData();
  await AsyncStorage.setItem(seedKey, JSON.stringify({ seededAt: Date.now() }));
};

export const prepareAuthUserDatabase = async (user?: Pick<User, 'email'> | null) => {
  const account = getDemoAccountConfig(user?.email);
  configureDatabaseForAuthUser(user);

  if (!account) {
    return { isDemoAccount: false };
  }

  await ensureDemoAccountSeeded(account);
  return { isDemoAccount: true, account };
};
