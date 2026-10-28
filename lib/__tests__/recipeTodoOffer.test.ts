import { getRecipeTodoOffer, getRecipeTodoOfferKey } from '@/lib/recipeTodoOffer';

describe('recipe todo offer parsing', () => {
  it('extracts clean recipe titles from recipe questions', () => {
    expect(getRecipeTodoOffer('how do i make chicken curry')).toEqual({
      recipeTitle: 'Chicken curry',
      offerKey: 'chicken curry',
    });

    expect(getRecipeTodoOffer('Can you show me how to bake banana bread step by step?')).toEqual({
      recipeTitle: 'Banana bread',
      offerKey: 'banana bread',
    });
  });

  it('extracts titles from explicit recipe wording', () => {
    expect(getRecipeTodoOffer('give me a paneer tikka recipe')).toEqual({
      recipeTitle: 'Paneer tikka',
      offerKey: 'paneer tikka',
    });

    expect(getRecipeTodoOffer('recipe for tomato soup with ingredients')).toEqual({
      recipeTitle: 'Tomato soup',
      offerKey: 'tomato soup',
    });
  });

  it('does not offer when the user already asked for a todo action', () => {
    expect(getRecipeTodoOffer('add chicken curry to my todo')).toBeNull();
    expect(getRecipeTodoOffer('open this in todo')).toBeNull();
  });

  it('does not offer for generic or unrelated messages', () => {
    expect(getRecipeTodoOffer('what should I do today')).toBeNull();
    expect(getRecipeTodoOffer('give me a recipe')).toBeNull();
    expect(getRecipeTodoOffer('make a reservation for dinner')).toBeNull();
    expect(getRecipeTodoOffer('prepare a report for tomorrow')).toBeNull();
  });

  it('normalizes recipe offer keys for matching', () => {
    expect(getRecipeTodoOfferKey('Chicken  Curry!')).toBe('chicken curry');
  });
});
