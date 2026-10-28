export type ToolCallKeyInput = {
  callId?: unknown;
  name?: unknown;
  arguments?: unknown;
  clientRequestId?: unknown;
};

function getToolCallName(toolCall: ToolCallKeyInput) {
  return typeof toolCall?.name === 'string' ? toolCall.name.trim() : '';
}

function getRequestId(toolCall: ToolCallKeyInput, fallbackRequestId?: string) {
  if (typeof toolCall?.clientRequestId === 'string' && toolCall.clientRequestId.trim()) {
    return toolCall.clientRequestId.trim();
  }
  return fallbackRequestId || '';
}

function getSerializedArguments(toolCall: ToolCallKeyInput) {
  try {
    return JSON.stringify(toolCall?.arguments ?? {});
  } catch {
    return '[unserializable]';
  }
}

export function getToolCallBatchKey(toolCall: ToolCallKeyInput, fallbackRequestId?: string) {
  const name = getToolCallName(toolCall);
  if (!name) return '';

  const requestId = getRequestId(toolCall, fallbackRequestId);
  const serializedArguments = getSerializedArguments(toolCall);

  return requestId
    ? `request:${requestId}:${name}:${serializedArguments}`
    : `shape:${name}:${serializedArguments}`;
}

export function getToolCallExecutionKey(toolCall: ToolCallKeyInput, fallbackRequestId?: string) {
  const batchKey = getToolCallBatchKey(toolCall, fallbackRequestId);
  if (batchKey.startsWith('request:')) {
    return batchKey;
  }

  const name = getToolCallName(toolCall);
  if (!name) return '';

  const callId = typeof toolCall?.callId === 'string' ? toolCall.callId.trim() : '';
  if (callId) {
    return `call:${callId}`;
  }

  return batchKey;
}

export function dedupeToolCallsByBatchKey<T extends ToolCallKeyInput>(toolCalls: T[], fallbackRequestId?: string) {
  const seen = new Set<string>();
  return toolCalls.filter((toolCall) => {
    const key = getToolCallBatchKey(toolCall, fallbackRequestId);
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
