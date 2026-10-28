import { shouldShowRecipeGuideShortcut } from '@/lib/recipeGuidance';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

jest.mock('@/firebaseConfig', () => ({
  auth: {
    currentUser: null,
  },
}));

jest.mock('@/lib/aiDataSharingConsent', () => ({
  requireAiDataSharingConsent: jest.fn(async () => {}),
}));

jest.mock('@/database/database', () => ({
  database: {
    collections: {
      get: jest.fn(),
    },
    write: jest.fn(),
  },
}));

describe('recipe guidance shortcut detection', () => {
  it('shows for likely Personal workspace recipe todos', () => {
    expect(shouldShowRecipeGuideShortcut({
      workspace: 'Personal',
      text: 'make chicken curry',
      completed: false,
    })).toBe(true);

    expect(shouldShowRecipeGuideShortcut({
      workspace: 'Personal',
      text: 'bake banana bread',
      completed: false,
    })).toBe(true);

    expect(shouldShowRecipeGuideShortcut({
      workspace: 'Personal',
      text: 'cook pasta for dinner',
      completed: false,
    })).toBe(true);
  });

  it('does not show for unrelated or non-Personal todos', () => {
    expect(shouldShowRecipeGuideShortcut({
      workspace: 'Personal',
      text: 'call dentist',
      completed: false,
    })).toBe(false);

    expect(shouldShowRecipeGuideShortcut({
      workspace: 'Goals',
      text: 'cook pasta',
      completed: false,
    })).toBe(false);

    expect(shouldShowRecipeGuideShortcut({
      workspace: 'Wishlist',
      text: 'buy oven mitts',
      completed: false,
    })).toBe(false);
  });

  it('hides completed recipe todos', () => {
    expect(shouldShowRecipeGuideShortcut({
      workspace: 'Personal',
      text: 'make soup',
      completed: true,
    })).toBe(false);
  });

  it('uses stored task kind before legacy recipe terms', () => {
    expect(shouldShowRecipeGuideShortcut({
      workspace: 'Personal',
      text: 'make chicken curry',
      completed: false,
      taskKind: 'normal',
    })).toBe(false);

    expect(shouldShowRecipeGuideShortcut({
      workspace: 'Personal',
      text: 'learn basic guitar',
      completed: false,
      taskKind: 'skill',
    })).toBe(false);

    expect(shouldShowRecipeGuideShortcut({
      workspace: 'Personal',
      text: 'dinner',
      completed: false,
      taskKind: 'recipe',
    })).toBe(true);
  });
});
