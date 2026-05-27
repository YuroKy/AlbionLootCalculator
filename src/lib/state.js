export const MIN_GROUP_SIZE = 1;
export const MAX_GROUP_SIZE = 10;
export const STORAGE_KEY = 'albion-loot-calculator-state';

export function clampGroupSize(size) {
  const parsed = Number.parseInt(size, 10);
  if (Number.isNaN(parsed)) return MIN_GROUP_SIZE;

  return Math.min(MAX_GROUP_SIZE, Math.max(MIN_GROUP_SIZE, parsed));
}

export function serializeState(state) {
  const json = JSON.stringify(state);
  const encoded = btoa(encodeURIComponent(json));

  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function deserializeState(value) {
  if (!value) return null;

  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    return JSON.parse(decodeURIComponent(atob(padded)));
  } catch {
    return null;
  }
}

export function normalizeParticipantState(participants) {
  if (!Array.isArray(participants)) return [];

  return participants
    .slice(0, MAX_GROUP_SIZE)
    .map((participant, index) => ({
      id: typeof participant?.id === 'string' ? participant.id : `player-${index + 1}`,
      name: typeof participant?.name === 'string' ? participant.name : `Учасник ${index + 1}`,
      loot: typeof participant?.loot === 'string' ? participant.loot : String(participant?.loot ?? '0'),
    }));
}

export function normalizeAppState(state) {
  if (!state || typeof state !== 'object') return null;

  const participants = normalizeParticipantState(state.participants);
  const groupSize = clampGroupSize(state.groupSize ?? participants.length);
  if (participants.length === 0) return null;

  return {
    groupSize: clampGroupSize(groupSize),
    participants: participants.slice(0, groupSize),
  };
}
