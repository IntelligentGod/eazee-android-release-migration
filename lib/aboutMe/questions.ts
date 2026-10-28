/** The ten "Get to know me" questions. Values match the server's schema (src/profile/aboutMe.ts). */

export type Option<T extends string = string> = { value: T; label: string };

export const PERSONALITY_ROUTE_OPTIONS = [
  { value: 'test', label: 'Take the quick personality test' },
  { value: 'mbti', label: 'I know my MBTI / 16Personalities type' },
  { value: 'big_five', label: 'I have Big Five results' },
  { value: 'other', label: 'I have another personality result' },
  { value: 'skip', label: 'Skip personality for now' },
] as const satisfies readonly Option[];
export type PersonalityRoute = (typeof PERSONALITY_ROUTE_OPTIONS)[number]['value'];

export const AGE_RANGE_OPTIONS = [
  { value: 'under_18', label: 'Under 18' },
  { value: '18_24', label: '18–24' },
  { value: '25_34', label: '25–34' },
  { value: '35_44', label: '35–44' },
  { value: '45_54', label: '45–54' },
  { value: '55_64', label: '55–64' },
  { value: '65_plus', label: '65+' },
  { value: 'prefer_not', label: 'Prefer not to say' },
] as const satisfies readonly Option[];

export const WORK_SITUATION_OPTIONS = [
  { value: 'full_time', label: 'Employed full-time' },
  { value: 'part_time', label: 'Employed part-time' },
  { value: 'self_employed', label: 'Self-employed / freelancer' },
  { value: 'founder', label: 'Business owner / founder' },
  { value: 'student', label: 'Student' },
  { value: 'looking', label: 'Looking for work' },
  { value: 'caring', label: 'Caring for family / managing a household' },
  { value: 'break', label: 'Taking a break' },
  { value: 'retired', label: 'Retired' },
  { value: 'other', label: 'Other' },
] as const satisfies readonly Option[];

export const INTEREST_OPTIONS = [
  { value: 'fitness', label: 'Fitness / sport' },
  { value: 'gaming', label: 'Gaming' },
  { value: 'technology', label: 'Technology' },
  { value: 'art_design', label: 'Art / design' },
  { value: 'music', label: 'Music' },
  { value: 'reading_writing', label: 'Reading / writing' },
  { value: 'cooking', label: 'Cooking / food' },
  { value: 'travel', label: 'Travel' },
  { value: 'outdoors', label: 'Outdoors / nature' },
  { value: 'socialising', label: 'Socialising' },
  { value: 'making', label: 'Making / DIY' },
  { value: 'learning', label: 'Learning new things' },
  { value: 'other', label: 'Other' },
] as const satisfies readonly Option[];

export const USE_FOR_OPTIONS = [
  { value: 'plan_day', label: 'Planning my day' },
  { value: 'tasks', label: 'Tasks and reminders' },
  { value: 'work', label: 'Work / business' },
  { value: 'study', label: 'Studying / learning' },
  { value: 'writing', label: 'Writing / communication' },
  { value: 'brainstorm', label: 'Brainstorming / creativity' },
  { value: 'research', label: 'Decisions / research' },
  { value: 'goals_habits', label: 'Personal goals / habits' },
  { value: 'everyday', label: 'Everyday questions' },
] as const satisfies readonly Option[];

export const FOCUS_AREA_OPTIONS = [
  { value: 'career', label: 'Career / finding work' },
  { value: 'business', label: 'Business / a project' },
  { value: 'education', label: 'Education / a skill' },
  { value: 'wellbeing', label: 'Fitness / wellbeing' },
  { value: 'organisation', label: 'Personal organisation' },
  { value: 'creative', label: 'A creative project' },
  { value: 'people_hobbies', label: 'Making time for people or hobbies' },
  { value: 'figuring_out', label: 'Still figuring it out' },
  { value: 'other', label: 'Other' },
] as const satisfies readonly Option[];

export const ANSWER_STYLE_OPTIONS = [
  { value: 'short', label: 'Short: give me the main point' },
  { value: 'step_by_step', label: 'Step by step: show me what to do' },
  { value: 'detailed', label: 'Detailed: explain the reasoning' },
  { value: 'adapt', label: 'Adapt to the question' },
] as const satisfies readonly Option[];

export const TONE_OPTIONS = [
  { value: 'warm', label: 'Warm and encouraging' },
  { value: 'direct', label: 'Direct and straightforward' },
  { value: 'calm', label: 'Calm and professional' },
  { value: 'playful', label: 'Playful and cheeky' },
  { value: 'adapt', label: 'Adapt to the situation' },
] as const satisfies readonly Option[];

export const ORGANISE_STYLE_OPTIONS = [
  { value: 'schedule', label: 'A clear schedule' },
  { value: 'priority_list', label: 'A flexible priority list' },
  { value: 'one_step', label: 'One next step at a time' },
  { value: 'mixture', label: 'A mixture, depending on the task' },
] as const satisfies readonly Option[];

export const STUCK_HELP_OPTIONS = [
  { value: 'smaller_step', label: 'Make the next step smaller' },
  { value: 'talk_through', label: 'Help me talk it through' },
  { value: 'recommendation', label: 'Give me a clear recommendation' },
  { value: 'options', label: 'Show me a few options' },
  { value: 'remind_why', label: 'Remind me why the goal matters' },
] as const satisfies readonly Option[];

export const MBTI_TYPES = [
  'ISTJ', 'ISFJ', 'INFJ', 'INTJ', 'ISTP', 'ISFP', 'INFP', 'INTP',
  'ESTP', 'ESFP', 'ENFP', 'ENTP', 'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ',
] as const;
export type MbtiType = (typeof MBTI_TYPES)[number];

export const MBTI_SOURCE_OPTIONS = [
  { value: '16personalities', label: '16Personalities' },
  { value: 'mbti', label: 'Official MBTI' },
  { value: 'other', label: 'Somewhere else' },
] as const satisfies readonly Option[];

export const BIG_FIVE_UNIT_OPTIONS = [
  { value: 'percentile', label: 'Percentile' },
  { value: 'percent', label: '%' },
  { value: 'scale', label: 'Score out of…' },
] as const satisfies readonly Option[];

type ValueOf<T extends readonly Option[]> = T[number]['value'];

export type AboutMe = {
  ageRange?: ValueOf<typeof AGE_RANGE_OPTIONS>;
  workSituations?: ValueOf<typeof WORK_SITUATION_OPTIONS>[];
  workText?: string;
  interests?: ValueOf<typeof INTEREST_OPTIONS>[];
  customInterests?: string;
  useFor?: ValueOf<typeof USE_FOR_OPTIONS>[];
  focusAreas?: ValueOf<typeof FOCUS_AREA_OPTIONS>[];
  goalText?: string;
};

export type AssistantPreferences = {
  answerStyle?: ValueOf<typeof ANSWER_STYLE_OPTIONS>;
  tone?: ValueOf<typeof TONE_OPTIONS>;
  organiseStyle?: ValueOf<typeof ORGANISE_STYLE_OPTIONS>;
  stuckHelp?: ValueOf<typeof STUCK_HELP_OPTIONS>;
};

export type ProfileSection = 'about_me' | 'assistant_preferences';

/** A choice question (Q2-Q10). Q1, the personality route, has its own screen. */
export type ChoiceQuestion = {
  id: 'q2' | 'q3' | 'q4' | 'q5' | 'q6' | 'q7' | 'q8' | 'q9' | 'q10';
  section: ProfileSection;
  field: keyof AboutMe | keyof AssistantPreferences;
  title: string;
  options: readonly Option[];
  /** Absent: single choice. */
  maxSelected?: number;
  note?: string;
  text?: { field: 'workText' | 'customInterests' | 'goalText'; label: string; placeholder: string; maxLength: number };
};

export const PROFILE_QUESTIONS: ChoiceQuestion[] = [
  {
    id: 'q2',
    section: 'about_me',
    field: 'ageRange',
    title: 'What’s your age range?',
    options: AGE_RANGE_OPTIONS,
  },
  {
    id: 'q3',
    section: 'about_me',
    field: 'workSituations',
    title: 'What best describes your current work or study situation?',
    options: WORK_SITUATION_OPTIONS,
    maxSelected: 3,
    text: {
      field: 'workText',
      label: 'What do you do or study?',
      placeholder: 'e.g. Software developer, Nursing student, Running an online store',
      maxLength: 120,
    },
  },
  {
    id: 'q4',
    section: 'about_me',
    field: 'interests',
    title: 'What do you enjoy outside work or study?',
    options: INTEREST_OPTIONS,
    maxSelected: 5,
    text: { field: 'customInterests', label: 'Anything else you enjoy?', placeholder: 'e.g. Bouldering, board games', maxLength: 120 },
  },
  {
    id: 'q5',
    section: 'about_me',
    field: 'useFor',
    title: 'What would you mainly like to use Eazee for?',
    options: USE_FOR_OPTIONS,
    maxSelected: USE_FOR_OPTIONS.length,
    note: 'This guides suggestions. You can still ask Eazee anything.',
  },
  {
    id: 'q6',
    section: 'about_me',
    field: 'focusAreas',
    title: 'What would you most like to make progress on right now?',
    options: FOCUS_AREA_OPTIONS,
    maxSelected: 2,
    text: { field: 'goalText', label: 'One specific goal you’d like help with?', placeholder: 'e.g. Run 5 km by June', maxLength: 200 },
  },
  {
    id: 'q7',
    section: 'assistant_preferences',
    field: 'answerStyle',
    title: 'How do you usually like answers?',
    options: ANSWER_STYLE_OPTIONS,
  },
  {
    id: 'q8',
    section: 'assistant_preferences',
    field: 'tone',
    title: 'What tone works best for you?',
    options: TONE_OPTIONS,
    note: 'Whatever the tone, Eazee will still disagree with you honestly when it should.',
  },
  {
    id: 'q9',
    section: 'assistant_preferences',
    field: 'organiseStyle',
    title: 'How do you like to organise things?',
    options: ORGANISE_STYLE_OPTIONS,
  },
  {
    id: 'q10',
    section: 'assistant_preferences',
    field: 'stuckHelp',
    title: 'When you get stuck, what helps most?',
    options: STUCK_HELP_OPTIONS,
  },
];

export const labelFor = (options: readonly Option[], value: string | undefined) =>
  options.find((option) => option.value === value)?.label;
