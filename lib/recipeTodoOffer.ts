export type RecipeTodoOffer = {
  recipeTitle: string;
  offerKey: string;
};

const RECIPE_ACTION_PATTERN = /\b(?:make|cook|bake|prepare|air fry|grill|fry|saute|sauté)\b/i;
const RECIPE_REQUEST_PATTERN = /\b(?:recipe|cooking guide|recipe guide|video guide|cook(?:ing)?|bak(?:e|ing)|meal|dish|dinner|lunch|breakfast)\b/i;
const TODO_ACTION_PATTERN = /\b(?:todo|task|remind me|add (?:it|this|that) to todo|open (?:it|this|that) in todo)\b/i;
const FOOD_CONTEXT_PATTERN = /\b(?:curry|soup|stew|pasta|rice|bread|cake|cookie|chicken|fish|beef|pork|tofu|paneer|vegetable|salad|sauce|noodle|roast|dessert|coffee|tea|smoothie|sandwich|pizza|taco|burger|egg|omelet|dal|lentil|beans|potato|tomato|banana|chocolate|meal|dish|dinner|lunch|breakfast)\b/i;
const NON_RECIPE_CONTEXT_PATTERN = /\b(?:reservation|booking|appointment|meeting|report|presentation|document|email|call|message|task|todo|plan|schedule|payment|invoice|purchase|order|delivery|trip|travel)\b/i;
const GENERIC_RECIPE_TITLES = new Set([
  'a',
  'an',
  'breakfast',
  'dinner',
  'dish',
  'food',
  'lunch',
  'meal',
  'recipe',
  'something',
  'that',
  'the',
  'this',
]);

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const stripRecipeTitleNoise = (value: string) => normalizeWhitespace(value)
  .replace(/^[\s"'`]+|[\s"'`?.!,;:]+$/g, '')
  .replace(/^(?:a|an|the)\s+/i, '')
  .replace(/\b(?:recipe|cooking guide|recipe guide|video guide|tutorial)\b.*$/i, '')
  .replace(/\b(?:step by step|with steps|with ingredients|with timestamps|with transcript|including ingredients)\b.*$/i, '')
  .replace(/\b(?:for me|please)\b$/i, '')
  .replace(/\b(?:tonight|today|tomorrow)\b$/i, '')
  .trim();

const toSentenceTitle = (value: string) => {
  const clean = stripRecipeTitleNoise(value).toLowerCase();
  if (!clean) return '';
  return `${clean.charAt(0).toUpperCase()}${clean.slice(1)}`;
};

export const getRecipeTodoOfferKey = (value: string) => normalizeWhitespace(value)
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^\p{L}\p{N}\s]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const getRecipeTitleCandidate = (text: string) => {
  const clean = normalizeWhitespace(text)
    .replace(/^[\s"'`]+|[\s"'`?.!,;:]+$/g, '');

  const recipeForMatch = clean.match(/\b(?:recipe|cooking guide|recipe guide|video guide)\s+(?:for|of|to)\s+(.+)$/i);
  if (recipeForMatch?.[1]) return recipeForMatch[1];

  const trailingRecipeMatch = clean.match(/^(?:can you |could you |please |give me |show me |tell me )?(?:a |an |the )?(.+?)\s+(?:recipe|cooking guide|recipe guide|video guide)$/i);
  if (trailingRecipeMatch?.[1]) return trailingRecipeMatch[1];

  const actionMatch = clean.match(
    /(?:^|\b)(?:how\s+(?:do|can|would|should)\s+(?:i|we|you)\s+|how\s+to\s+|can you\s+(?:show|tell|teach|help)\s+me\s+(?:how\s+to\s+)?|could you\s+(?:show|tell|teach|help)\s+me\s+(?:how\s+to\s+)?|please\s+|i\s+(?:want|need|would like|wanna)\s+to\s+|let'?s\s+)?(?:make|cook|bake|prepare|air fry|grill|fry|saute|sauté)\s+(.+)$/i
  );
  if (actionMatch?.[1]) return actionMatch[1];

  return '';
};

export const getRecipeTodoOffer = (text: string): RecipeTodoOffer | null => {
  if (!text || TODO_ACTION_PATTERN.test(text) || (!RECIPE_REQUEST_PATTERN.test(text) && !RECIPE_ACTION_PATTERN.test(text))) {
    return null;
  }

  const titleCandidate = getRecipeTitleCandidate(text);
  if (NON_RECIPE_CONTEXT_PATTERN.test(titleCandidate)) {
    return null;
  }
  if (!RECIPE_REQUEST_PATTERN.test(text) && !FOOD_CONTEXT_PATTERN.test(titleCandidate)) {
    return null;
  }

  const recipeTitle = toSentenceTitle(titleCandidate);
  const offerKey = getRecipeTodoOfferKey(recipeTitle);
  if (!recipeTitle || !offerKey || GENERIC_RECIPE_TITLES.has(offerKey)) {
    return null;
  }

  return {
    recipeTitle,
    offerKey,
  };
};
