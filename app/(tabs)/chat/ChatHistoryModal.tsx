import React, { useEffect, useState } from 'react';
import MIcon from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { ChatSessionListItem } from './types';
import ScrollViewWithBar from '@/components/ScrollViewWithBar';

type ChatHistoryModalProps = {
  visible: boolean;
  /** Header text; Fix my life shows its own history. */
  title?: string;
  sessions: ChatSessionListItem[];
  activeSessionId: string | null;
  showSummaries?: boolean;
  isLeftHanded?: boolean;
  onClose: () => void;
  onSelectSession: (sessionId: string) => void;
  onTogglePin: (sessionId: string, pinned: boolean) => void;
  onDeleteSession: (sessionId: string) => void;
  onRenameSession?: (sessionId: string, title: string) => void;
};

function formatChatDate(timestamp: number) {
  const value = timestamp || Date.now();
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

function getSearchTerms(query: string) {
  return Array.from(new Set(
    query
      .trim()
      .toLocaleLowerCase()
      .split(/\s+/)
      .map((term) => term.trim())
      .filter(Boolean)
  )).sort((left, right) => right.length - left.length);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function includesAnySearchTerm(value: string, query: string) {
  const searchTerms = getSearchTerms(query);
  if (!searchTerms.length) return false;

  const normalizedValue = value.toLocaleLowerCase();
  return searchTerms.some((term) => normalizedValue.includes(term));
}

function summaryAddsSearchContext(title: string, summary: string, query: string) {
  const searchTerms = getSearchTerms(query);
  if (!searchTerms.length) return false;

  const normalizedTitle = title.toLocaleLowerCase();
  const normalizedSummary = summary.toLocaleLowerCase();

  return searchTerms.some((term) => (
    normalizedSummary.includes(term) && !normalizedTitle.includes(term)
  ));
}

function searchMatchesSession(session: ChatSessionListItem, query: string) {
  const searchTerms = getSearchTerms(query);
  if (!searchTerms.length) return true;

  const content = [session.title, session.summary]
    .map((value) => String(value || '').toLocaleLowerCase())
    .join('\n');

  return searchTerms.every((term) => content.includes(term));
}

function getSummaryMatchSnippet(value: string, query: string) {
  const searchTerms = getSearchTerms(query);
  const summary = value.trim();
  if (!summary || !searchTerms.length) {
    return summary;
  }

  const normalizedSummary = summary.toLocaleLowerCase();
  let matchIndex = -1;
  let matchedTermLength = 0;

  for (const term of searchTerms) {
    const nextIndex = normalizedSummary.indexOf(term);
    if (nextIndex === -1) continue;
    if (matchIndex === -1 || nextIndex < matchIndex) {
      matchIndex = nextIndex;
      matchedTermLength = term.length;
    }
  }

  if (matchIndex === -1) {
    return summary;
  }

  const leadingWindow = 24;
  const trailingWindow = 34;
  let start = Math.max(0, matchIndex - leadingWindow);
  let end = Math.min(summary.length, matchIndex + matchedTermLength + trailingWindow);

  if (start > 0) {
    const nextBoundary = summary.indexOf(' ', start);
    if (nextBoundary !== -1 && nextBoundary < matchIndex) {
      start = nextBoundary + 1;
    }
  }

  if (end < summary.length) {
    const nextBoundary = summary.lastIndexOf(' ', end);
    if (nextBoundary !== -1 && nextBoundary > matchIndex) {
      end = nextBoundary;
    }
  }

  const prefix = start > 0 ? '... ' : '';
  const suffix = end < summary.length ? ' ...' : '';
  return `${prefix}${summary.slice(start, end).trim()}${suffix}`;
}

function renderHighlightedText(value: string, query: string) {
  const searchTerms = getSearchTerms(query);
  if (!searchTerms.length) {
    return value;
  }

  const matcher = new RegExp(`(${searchTerms.map(escapeRegExp).join('|')})`, 'gi');
  const normalizedTerms = new Set(searchTerms);

  return value.split(matcher).map((part, index) => {
    if (!normalizedTerms.has(part.toLocaleLowerCase())) {
      return part;
    }

    return (
      <Text
        key={`${part}-${index}`}
        style={{
          color: '#033937',
          backgroundColor: '#A6FFF1',
          fontWeight: '800',
        }}
      >
        {part}
      </Text>
    );
  });
}

function ChatHistoryRow({
  isActive,
  session,
  searchQuery,
  showSummaries,
  onDeleteSession,
  onRenameRequest,
  onSelectSession,
  onTogglePin,
}: {
  isActive: boolean;
  session: ChatSessionListItem;
  searchQuery: string;
  showSummaries?: boolean;
  onDeleteSession: (sessionId: string) => void;
  onRenameRequest?: (sessionId: string) => void;
  onSelectSession: (sessionId: string) => void;
  onTogglePin: (sessionId: string, pinned: boolean) => void;
}) {
  const title = session.title || 'New Chat';
  const summary = session.summary?.trim() || '';
  const hasSearchQuery = searchQuery.trim().length > 0;
  const titleMatchesSearch = includesAnySearchTerm(title, searchQuery);
  const summaryMatchesSearch = includesAnySearchTerm(summary, searchQuery);
  const shouldShowSummarySnippet = hasSearchQuery && summaryMatchesSearch && (
    !titleMatchesSearch || summaryAddsSearchContext(title, summary, searchQuery)
  );
  const shouldShowFullSummary = showSummaries && !hasSearchQuery;

  return (
    <TouchableOpacity
      onPress={() => onSelectSession(session.id)}
      style={{ marginBottom: 10 }}
    >
      <LinearGradient
        colors={isActive ? ['#04534D', '#032F2E'] : ['#067369', '#004643']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{
          minHeight: 56,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: 'rgba(173, 255, 240, 0.55)',
          paddingLeft: 44,
          paddingRight: onRenameRequest ? 76 : 44,
          paddingVertical: 14,
          justifyContent: 'center',
          shadowColor: '#001A17',
          shadowOpacity: 0.22,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        <TouchableOpacity
          onPress={() => onTogglePin(session.id, session.pinned)}
          style={{ position: 'absolute', top: 13, left: 12, zIndex: 2 }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MIcon name={session.pinned ? 'pin' : 'pin-outline'} size={20} color={session.pinned ? '#FFFFFF' : '#21A19B'} />
        </TouchableOpacity>
        {onRenameRequest && (
          <TouchableOpacity
            onPress={() => onRenameRequest(session.id)}
            style={{ position: 'absolute', top: 13, right: 44, zIndex: 2 }}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            accessibilityRole="button"
            accessibilityLabel="Rename chat"
          >
            <MIcon name="pencil-outline" size={20} color="#137D78" />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => onDeleteSession(session.id)}
          style={{ position: 'absolute', top: 13, right: 12, zIndex: 2 }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MIcon name="trash-can-outline" size={20} color="#137D78" />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Text numberOfLines={1} ellipsizeMode="tail" style={{ flex: 1, color: '#F4FFFD', fontSize: 13, fontWeight: '700' }}>
            {renderHighlightedText(title, searchQuery)}
          </Text>
          <Text style={{ color: '#5CA49F', fontSize: 11, fontWeight: '500' }}>
            {formatChatDate(session.lastMessageAt || session.createdAt)}
          </Text>
        </View>
        {shouldShowSummarySnippet && (
          <Text
            style={{ color: '#D8FFFA', fontSize: 12, lineHeight: 17, marginTop: 8 }}
            numberOfLines={2}
          >
            {renderHighlightedText(getSummaryMatchSnippet(summary, searchQuery), searchQuery)}
          </Text>
        )}
        {shouldShowFullSummary && (
          <Text
            style={{ color: '#C7F6F1', fontSize: 12, lineHeight: 17, marginTop: 8 }}
            numberOfLines={3}
          >
            {summary || 'No summary saved yet.'}
          </Text>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

/** Rename a chat: used from the history list and from the title above a chat. */
export function RenameChatDialog({
  initialTitle,
  onCancel,
  onSave,
}: {
  initialTitle: string;
  onCancel: () => void;
  onSave: (title: string) => void;
}) {
  const [value, setValue] = useState(initialTitle);
  const trimmed = value.trim();
  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 10,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
        backgroundColor: 'rgba(0, 20, 18, 0.55)',
      }}
    >
      <TouchableOpacity
        onPress={onCancel}
        activeOpacity={1}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <LinearGradient
        colors={['#067369', '#004643']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: '100%',
          maxWidth: 340,
          borderRadius: 24,
          borderWidth: 1,
          borderColor: 'rgba(173, 255, 240, 0.55)',
          padding: 20,
          elevation: 12,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <MIcon name="pencil-outline" size={22} color="#3DC5B5" />
          <Text style={{ color: '#3DC5B5', fontSize: 20, fontWeight: '700' }}>Rename chat</Text>
        </View>
        <TextInput
          value={value}
          onChangeText={setValue}
          autoFocus
          selectTextOnFocus
          maxLength={60}
          returnKeyType="done"
          onSubmitEditing={() => { if (trimmed) onSave(trimmed); }}
          placeholder="Chat name"
          placeholderTextColor="rgba(216, 255, 250, 0.5)"
          accessibilityLabel="Chat name"
          style={{
            color: '#F4FFFD',
            fontSize: 15,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: 'rgba(173, 255, 240, 0.45)',
            backgroundColor: 'rgba(1, 48, 45, 0.6)',
            paddingHorizontal: 14,
            paddingVertical: 10,
          }}
        />
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
          <TouchableOpacity
            onPress={onCancel}
            style={{
              flex: 1,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: 'rgba(173, 255, 240, 0.55)',
              backgroundColor: 'rgba(1, 48, 45, 0.6)',
            }}
          >
            <Text style={{ color: '#BEE7E1', fontSize: 15, fontWeight: '700' }}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity disabled={!trimmed} onPress={() => onSave(trimmed)} style={{ flex: 1, opacity: trimmed ? 1 : 0.5 }}>
            <LinearGradient
              colors={['#3DC5B5', '#1DAFB2']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={{ height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: '#003C37', fontSize: 15, fontWeight: '800' }}>Save</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </View>
  );
}

function DeleteChatConfirm({
  chatTitle,
  onCancel,
  onConfirm,
}: {
  chatTitle: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 10,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
        backgroundColor: 'rgba(0, 20, 18, 0.55)',
      }}
    >
      <TouchableOpacity
        onPress={onCancel}
        activeOpacity={1}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <LinearGradient
        colors={['#067369', '#004643']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: '100%',
          maxWidth: 340,
          borderRadius: 24,
          borderWidth: 1,
          borderColor: 'rgba(173, 255, 240, 0.55)',
          padding: 20,
          shadowColor: '#001A17',
          shadowOpacity: 0.35,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 12,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <MIcon name="trash-can-outline" size={22} color="#3DC5B5" />
          <Text style={{ color: '#3DC5B5', fontSize: 20, fontWeight: '700' }}>Delete chat</Text>
        </View>
        <Text style={{ color: '#D8FFFA', fontSize: 14, lineHeight: 20 }}>
          {`"${chatTitle}" will be permanently deleted.`}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
          <TouchableOpacity
            onPress={onCancel}
            style={{
              flex: 1,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: 'rgba(173, 255, 240, 0.55)',
              backgroundColor: 'rgba(1, 48, 45, 0.6)',
            }}
          >
            <Text style={{ color: '#BEE7E1', fontSize: 15, fontWeight: '700' }}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onConfirm} style={{ flex: 1 }}>
            <LinearGradient
              colors={['#3DC5B5', '#1DAFB2']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={{
                height: 44,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 6,
              }}
            >
              <MIcon name="trash-can-outline" size={17} color="#003C37" />
              <Text style={{ color: '#003C37', fontSize: 15, fontWeight: '800' }}>Delete</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </View>
  );
}

export function ChatHistoryModal({
  visible,
  title = 'Chats',
  sessions,
  activeSessionId,
  showSummaries = false,
  isLeftHanded = false,
  onClose,
  onSelectSession,
  onTogglePin,
  onDeleteSession,
  onRenameSession,
}: ChatHistoryModalProps) {
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingDeleteSession, setPendingDeleteSession] = useState<ChatSessionListItem | null>(null);
  const [pendingRenameSession, setPendingRenameSession] = useState<ChatSessionListItem | null>(null);

  useEffect(() => {
    if (visible) return;
    setIsSearchVisible(false);
    setSearchQuery('');
    setPendingDeleteSession(null);
  }, [visible]);

  const matchingSessions = sessions.filter((session) => searchMatchesSession(session, searchQuery));
  const hasSearchQuery = searchQuery.trim().length > 0;
  const showsEmptySearchState = isSearchVisible && hasSearchQuery && matchingSessions.length === 0;

  const toggleSearch = () => {
    if (isSearchVisible) {
      setIsSearchVisible(false);
      setSearchQuery('');
      return;
    }
    setIsSearchVisible(true);
  };
  const searchButton = sessions.length > 0 ? (
    <TouchableOpacity
      onPress={toggleSearch}
      style={{
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: isSearchVisible ? 'rgba(37, 165, 157, 0.18)' : 'transparent',
      }}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <MIcon name="magnify" size={22} color={isSearchVisible ? '#89FFF2' : '#1DAFB2'} />
    </TouchableOpacity>
  ) : null;
  const closeButton = (
    <TouchableOpacity
      onPress={onClose}
      style={{
        width: 30,
        height: 30,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <MIcon name="close" size={28} color="#1DAFB2" />
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1 }}>
        <TouchableOpacity
          onPress={onClose}
          activeOpacity={1}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <View
          style={{
            position: 'absolute',
            top: 72,
            left: 16,
            right: 16,
            bottom: 188,
            backgroundColor: 'rgba(0, 60, 55, 0.92)',
            borderRadius: 28,
            paddingHorizontal: 16,
            paddingVertical: 14,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 14, minHeight: 34 }}>
            <Text style={{ color: '#3DC5B5', fontSize: 28, fontWeight: '700' }}>
              {showSummaries ? `${title} TST` : title}
            </Text>
            <View
              style={{
                position: 'absolute',
                top: '50%',
                marginTop: -16,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                ...(isLeftHanded ? { left: 0 } : { right: 0 }),
              }}
            >
              {isLeftHanded ? closeButton : searchButton}
              {isLeftHanded ? searchButton : closeButton}
            </View>
          </View>
          {isSearchVisible && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                borderRadius: 16,
                borderWidth: 1,
                borderColor: 'rgba(128, 255, 244, 0.36)',
                backgroundColor: 'rgba(1, 48, 45, 0.78)',
                paddingLeft: 12,
                paddingRight: 10,
                marginBottom: 14,
              }}
            >
              <MIcon name="magnify" size={18} color="#6FE8DB" />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus={visible}
                placeholder="Search chats"
                placeholderTextColor="rgba(190, 231, 225, 0.52)"
                selectionColor="#83FFF4"
                autoCorrect={false}
                autoCapitalize="none"
                style={{
                  flex: 1,
                  color: '#F4FFFD',
                  fontSize: 14,
                  paddingVertical: 11,
                  paddingHorizontal: 10,
                }}
              />
              {hasSearchQuery && (
                <TouchableOpacity
                  onPress={() => setSearchQuery('')}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <MIcon name="close-circle" size={18} color="#7EEDE0" />
                </TouchableOpacity>
              )}
            </View>
          )}
          <ScrollViewWithBar keyboardShouldPersistTaps="handled">
            {sessions.length === 0 && (
              <Text style={{ color: '#BEE7E1', textAlign: 'center', marginTop: 24 }}>No chats yet</Text>
            )}
            {showsEmptySearchState && (
              <Text style={{ color: '#BEE7E1', textAlign: 'center', marginTop: 24 }}>
                No chats match &quot;{searchQuery.trim()}&quot;
              </Text>
            )}
            {matchingSessions.map((session) => (
              <ChatHistoryRow
                key={session.id}
                isActive={session.id === activeSessionId}
                session={session}
                searchQuery={searchQuery}
                showSummaries={showSummaries}
                onDeleteSession={(sessionId) => setPendingDeleteSession(sessions.find((item) => item.id === sessionId) ?? null)}
                onRenameRequest={onRenameSession
                  ? (sessionId) => setPendingRenameSession(sessions.find((item) => item.id === sessionId) ?? null)
                  : undefined}
                onSelectSession={onSelectSession}
                onTogglePin={onTogglePin}
              />
            ))}
          </ScrollViewWithBar>
        </View>
        {pendingRenameSession && onRenameSession && (
          <RenameChatDialog
            initialTitle={pendingRenameSession.title || ''}
            onCancel={() => setPendingRenameSession(null)}
            onSave={(title) => {
              onRenameSession(pendingRenameSession.id, title);
              setPendingRenameSession(null);
            }}
          />
        )}
        {pendingDeleteSession && (
          <DeleteChatConfirm
            chatTitle={pendingDeleteSession.title || 'New Chat'}
            onCancel={() => setPendingDeleteSession(null)}
            onConfirm={() => {
              onDeleteSession(pendingDeleteSession.id);
              setPendingDeleteSession(null);
            }}
          />
        )}
      </View>
    </Modal>
  );
}
