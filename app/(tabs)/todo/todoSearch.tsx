import React from 'react';
import { StyleSheet, Text } from 'react-native';

type SearchableTodo = {
  text?: string;
  details?: string;
};

function getTodoSearchTerms(query: string) {
  return Array.from(new Set(
    query
      .trim()
      .toLocaleLowerCase()
      .split(/\s+/)
      .map((term) => term.trim())
      .filter(Boolean)
  )).sort((left, right) => right.length - left.length);
}

function escapeTodoSearchRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function todoValueIncludesAnySearchTerm(value: string, query: string) {
  const searchTerms = getTodoSearchTerms(query);
  if (!searchTerms.length) return false;

  const normalizedValue = value.toLocaleLowerCase();
  return searchTerms.some((term) => normalizedValue.includes(term));
}

export function todoDetailsAddSearchContext(title: string, details: string, query: string) {
  const searchTerms = getTodoSearchTerms(query);
  if (!searchTerms.length) return false;

  const normalizedTitle = title.toLocaleLowerCase();
  const normalizedDetails = details.toLocaleLowerCase();

  return searchTerms.some((term) => (
    normalizedDetails.includes(term) && !normalizedTitle.includes(term)
  ));
}

export function todoMatchesSearch(todo: SearchableTodo, query: string) {
  const searchTerms = getTodoSearchTerms(query);
  if (!searchTerms.length) return true;

  const content = [todo.text, todo.details]
    .map((value) => String(value || '').toLocaleLowerCase())
    .join('\n');

  return searchTerms.every((term) => content.includes(term));
}

export function getTodoDetailsMatchSnippet(value: string, query: string) {
  const searchTerms = getTodoSearchTerms(query);
  const details = value.trim();
  if (!details || !searchTerms.length) {
    return details;
  }

  const normalizedDetails = details.toLocaleLowerCase();
  let matchIndex = -1;
  let matchedTermLength = 0;

  for (const term of searchTerms) {
    const nextIndex = normalizedDetails.indexOf(term);
    if (nextIndex === -1) continue;
    if (matchIndex === -1 || nextIndex < matchIndex) {
      matchIndex = nextIndex;
      matchedTermLength = term.length;
    }
  }

  if (matchIndex === -1) {
    return details;
  }

  const leadingWindow = 24;
  const trailingWindow = 34;
  let start = Math.max(0, matchIndex - leadingWindow);
  let end = Math.min(details.length, matchIndex + matchedTermLength + trailingWindow);

  if (start > 0) {
    const nextBoundary = details.indexOf(' ', start);
    if (nextBoundary !== -1 && nextBoundary < matchIndex) {
      start = nextBoundary + 1;
    }
  }

  if (end < details.length) {
    const nextBoundary = details.lastIndexOf(' ', end);
    if (nextBoundary !== -1 && nextBoundary > matchIndex) {
      end = nextBoundary;
    }
  }

  const prefix = start > 0 ? '... ' : '';
  const suffix = end < details.length ? ' ...' : '';
  return `${prefix}${details.slice(start, end).trim()}${suffix}`;
}

export function renderTodoHighlightedText(value: string, query: string) {
  const searchTerms = getTodoSearchTerms(query);
  if (!searchTerms.length) {
    return value;
  }

  const matcher = new RegExp(`(${searchTerms.map(escapeTodoSearchRegExp).join('|')})`, 'gi');
  const normalizedTerms = new Set(searchTerms);

  return value.split(matcher).map((part, index) => {
    if (!normalizedTerms.has(part.toLocaleLowerCase())) {
      return part;
    }

    return (
      <Text key={`${part}-${index}`} style={styles.highlight}>
        {part}
      </Text>
    );
  });
}

export const todoSearchTextStyles = StyleSheet.create({
  detailsSnippet: {
    color: 'rgba(58, 104, 96, 0.86)',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
  },
  emptyText: {
    color: '#DDFDF8',
    textAlign: 'center',
    marginTop: 24,
  },
});

const styles = StyleSheet.create({
  highlight: {
    color: '#033937',
    backgroundColor: '#A6FFF1',
    fontWeight: '800',
  },
});
