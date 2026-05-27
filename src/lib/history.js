export const HISTORY_STORAGE_KEY = 'albion-loot-calculator-history';

export function createHistoryEntry({ participants, result, now = new Date() }) {
  return {
    id: `split-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now.toISOString(),
    participants: participants.map((participant) => ({
      id: participant.id,
      name: participant.name,
      loot: participant.loot,
    })),
    total: result.total,
    baseShare: result.baseShare,
    remainder: result.remainder,
    transactions: result.transactions.map((transaction) => ({ ...transaction })),
  };
}

export function normalizeHistoryEntries(value) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      id: typeof entry.id === 'string' ? entry.id : `split-${entry.createdAt ?? Date.now()}`,
      createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : new Date().toISOString(),
      participants: Array.isArray(entry.participants) ? entry.participants : [],
      total: Number(entry.total) || 0,
      baseShare: Number(entry.baseShare) || 0,
      remainder: Number(entry.remainder) || 0,
      transactions: Array.isArray(entry.transactions) ? entry.transactions : [],
    }));
}

export function summarizeHistoryEntry(entry) {
  const payer = entry.transactions.reduce(
    (largest, transaction) => (transaction.amount > largest.amount ? transaction : largest),
    { fromName: '—', toName: '—', amount: 0 },
  );
  const receiver = entry.transactions.reduce(
    (largest, transaction) => (transaction.amount > largest.amount ? transaction : largest),
    { fromName: '—', toName: '—', amount: 0 },
  );

  return {
    playerCount: entry.participants.length,
    transferCount: entry.transactions.length,
    largestPayer: payer.amount > 0 ? payer.fromName : '—',
    largestReceiver: receiver.amount > 0 ? receiver.toName : '—',
  };
}

export function calculateSessionStats(entries) {
  const safeEntries = normalizeHistoryEntries(entries);
  const totalSilver = safeEntries.reduce((sum, entry) => sum + entry.total, 0);
  const totalTransfers = safeEntries.reduce((sum, entry) => sum + entry.transactions.length, 0);
  const playerTotals = new Map();

  safeEntries.forEach((entry) => {
    entry.participants.forEach((participant) => {
      playerTotals.set(participant.name, (playerTotals.get(participant.name) ?? 0) + (participant.loot ?? 0));
    });
  });

  const topPlayers = [...playerTotals.entries()]
    .map(([name, loot]) => ({ name, loot }))
    .sort((a, b) => b.loot - a.loot)
    .slice(0, 5);

  return {
    splitCount: safeEntries.length,
    totalSilver,
    averageTotal: safeEntries.length ? Math.round(totalSilver / safeEntries.length) : 0,
    averageShare: safeEntries.length
      ? Math.round(safeEntries.reduce((sum, entry) => sum + entry.baseShare, 0) / safeEntries.length)
      : 0,
    totalTransfers,
    topPlayer: topPlayers[0] ?? null,
    topPlayers,
  };
}

export function formatHistoryEntry(entry, formatSilver) {
  const summary = summarizeHistoryEntry(entry);
  const lines = [
    `Розподіл ${new Date(entry.createdAt).toLocaleString('uk-UA')}`,
    `Гравців: ${summary.playerCount}`,
    `Усього: ${formatSilver(entry.total)} silver`,
    `Частка: ${formatSilver(entry.baseShare)} silver`,
    `Переказів: ${summary.transferCount}`,
  ];

  if (entry.transactions.length > 0) {
    lines.push(
      ...entry.transactions.map(
        (transaction) =>
          `${transaction.fromName} -> ${transaction.toName}: ${formatSilver(transaction.amount)} silver`,
      ),
    );
  } else {
    lines.push('Переказів немає.');
  }

  return lines.join('\n');
}
