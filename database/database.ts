import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { Platform } from 'react-native';

import schema from './schema';
import migrations from './migrations';
import NoteModel from './models/NoteModel';
import FolderModel from './models/FolderModel';
import EventModel from './models/EventModel';
import EventSeriesModel from './models/EventSeriesModel';
import HomeEventCompletionModel from './models/HomeEventCompletionModel';
import AppSettingsModel from './models/AppSettingsModel';
import TokenModel from './models/TokenModel';
import AccountModel from './models/AccountModel';
import TodoModel from './models/TodoModel';
import TodoRecurrenceSeriesModel from './models/TodoRecurrenceSeriesModel';
import EmailModel from './models/EmailModel';
import UserPreferenceModel from './models/UserPreferenceModel';
import ChatSessionModel from './models/ChatSessionModel';
import ChatMessageModel from './models/ChatMessageModel';
import GoalGuidancePlanModel from './models/GoalGuidancePlanModel';
import RecipeGuideModel from './models/RecipeGuideModel';
import TaskGuideModel from './models/TaskGuideModel';
import SkillGuideModel from './models/SkillGuideModel';

export const DEFAULT_DATABASE_NAME = 'NotesApp';

const modelClasses = [NoteModel, FolderModel, EventModel, EventSeriesModel, HomeEventCompletionModel, AppSettingsModel, TokenModel, AccountModel, TodoModel, TodoRecurrenceSeriesModel, UserPreferenceModel, EmailModel, ChatSessionModel, ChatMessageModel, GoalGuidancePlanModel, RecipeGuideModel, TaskGuideModel, SkillGuideModel];
const databases = new Map<string, Database>();

const createDatabase = (dbName: string) => {
  const adapter = new SQLiteAdapter({
    schema,
    jsi: Platform.OS === 'ios',
    dbName,
    migrations,
  });

  return new Database({
    adapter,
    modelClasses,
  });
};

const getOrCreateDatabase = (dbName: string) => {
  const existing = databases.get(dbName);
  if (existing) {
    return existing;
  }

  const nextDatabase = createDatabase(dbName);
  databases.set(dbName, nextDatabase);
  return nextDatabase;
};

let activeDatabaseName = DEFAULT_DATABASE_NAME;

export let database = getOrCreateDatabase(activeDatabaseName);

export const getActiveDatabaseName = () => activeDatabaseName;

export const setActiveDatabaseName = (dbName: string) => {
  if (dbName === activeDatabaseName) {
    return database;
  }

  activeDatabaseName = dbName;
  database = getOrCreateDatabase(dbName);
  return database;
};
