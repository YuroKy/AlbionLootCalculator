import { MAX_GROUP_SIZE } from './state';
import { formatSilver, formatSilverInput, isValidSilverInput, parseSilverInput } from './silver';

export function parseParticipantImport(text) {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
    .filter((item) => item.line.length > 0);

  const errors = [];
  const participants = [];

  lines.slice(0, MAX_GROUP_SIZE).forEach(({ line, lineNumber }, index) => {
    const match = line.match(/^(.+?)(?::|\s+)([\d,\s]+)$/);

    if (!match) {
      errors.push({ lineNumber, message: 'очікується формат "Гравець 1,200,000"' });
      return;
    }

    const name = match[1].trim();
    const loot = match[2].trim();

    if (!name) {
      errors.push({ lineNumber, message: 'порожнє імʼя гравця' });
      return;
    }

    if (!isValidSilverInput(loot)) {
      errors.push({ lineNumber, message: 'сума silver має містити тільки цифри та коми' });
      return;
    }

    participants.push({
      id: `player-${index + 1}`,
      name,
      loot: formatSilverInput(loot) || '0',
    });
  });

  if (lines.length > MAX_GROUP_SIZE) {
    errors.push({ lineNumber: MAX_GROUP_SIZE + 1, message: `імпортовано максимум ${MAX_GROUP_SIZE} гравців` });
  }

  return { participants, errors };
}

export function calculateDeductions(fields) {
  const items = [
    { key: 'tax', label: 'Податок/комісія', value: fields?.tax ?? '' },
    { key: 'repair', label: 'Ремонт/фонд', value: fields?.repair ?? '' },
    { key: 'other', label: 'Інше', value: fields?.other ?? '' },
  ];

  const invalidFields = items.filter((item) => !isValidSilverInput(item.value)).map((item) => item.key);
  const values = Object.fromEntries(items.map((item) => [item.key, parseSilverInput(item.value)]));

  return {
    ...values,
    total: Object.values(values).reduce((sum, value) => sum + value, 0),
    invalidFields,
    items: items.map((item) => ({ ...item, amount: values[item.key] })),
  };
}

export function applyDeductionsToParticipants(participants, totalDeduction) {
  const normalized = participants.map((participant) => ({
    ...participant,
    loot: Math.max(0, Number(participant.loot) || 0),
  }));
  const grossTotal = normalized.reduce((sum, participant) => sum + participant.loot, 0);
  const deductionTotal = Math.min(Math.max(0, Number(totalDeduction) || 0), grossTotal);

  if (grossTotal === 0 || deductionTotal === 0) {
    return {
      grossTotal,
      totalDeduction: deductionTotal,
      distributableTotal: grossTotal,
      participants: normalized,
    };
  }

  const rawAllocations = normalized.map((participant, index) => {
    const exact = (participant.loot / grossTotal) * deductionTotal;
    const base = Math.floor(exact);

    return { index, base, fraction: exact - base };
  });
  const allocated = rawAllocations.reduce((sum, item) => sum + item.base, 0);
  let remainder = deductionTotal - allocated;
  const allocations = rawAllocations.map((item) => ({ ...item, amount: item.base }));

  allocations
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
    .forEach((item) => {
      if (remainder <= 0) return;
      item.amount += 1;
      remainder -= 1;
    });

  const allocationByIndex = new Map(allocations.map((item) => [item.index, item.amount]));
  const adjusted = normalized.map((participant, index) => ({
    ...participant,
    loot: Math.max(0, participant.loot - (allocationByIndex.get(index) ?? 0)),
  }));

  return {
    grossTotal,
    totalDeduction: deductionTotal,
    distributableTotal: grossTotal - deductionTotal,
    participants: adjusted,
  };
}

export function transactionKey(transaction, index = 0) {
  return `${transaction.fromId}:${transaction.toId}:${transaction.amount}:${index}`;
}

export function buildDiscordSummary(entryOrResult) {
  const transactions = entryOrResult?.transactions ?? [];
  const total = entryOrResult?.distributableTotal ?? entryOrResult?.total ?? 0;
  const grossTotal = entryOrResult?.grossTotal ?? total;
  const deductionsTotal = entryOrResult?.deductions?.total ?? 0;
  const baseShare = entryOrResult?.baseShare ?? 0;
  const lines = [
    `Loot split: ${formatSilver(total)} silver`,
    `Share: ${formatSilver(baseShare)} silver`,
  ];

  if (deductionsTotal > 0) {
    lines.splice(1, 0, `Gross: ${formatSilver(grossTotal)} silver`);
    lines.splice(2, 0, `Deductions: ${formatSilver(deductionsTotal)} silver`);
  }

  if (transactions.length === 0) {
    lines.push('Balanced: no transfers needed');
  } else {
    lines.push(
      ...transactions.map(
        (transaction) =>
          `${transaction.fromName} -> ${transaction.toName}: ${formatSilver(transaction.amount)} silver`,
      ),
    );
  }

  return lines.join('\n');
}

export function calculatePlayerStats(entries) {
  const stats = new Map();

  const getPlayer = (name) => {
    const key = name || 'Без імені';
    if (!stats.has(key)) {
      stats.set(key, {
        name: key,
        totalLoot: 0,
        splitCount: 0,
        averageLoot: 0,
        paidCount: 0,
        receivedCount: 0,
        netBalance: 0,
      });
    }

    return stats.get(key);
  };

  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const seen = new Set();

    (entry.participants ?? []).forEach((participant) => {
      const player = getPlayer(participant.name);
      player.totalLoot += Number(participant.loot) || 0;
      if (!seen.has(player.name)) {
        player.splitCount += 1;
        seen.add(player.name);
      }
    });

    (entry.transactions ?? []).forEach((transaction) => {
      const payer = getPlayer(transaction.fromName);
      const receiver = getPlayer(transaction.toName);
      const amount = Number(transaction.amount) || 0;

      payer.paidCount += 1;
      payer.netBalance -= amount;
      receiver.receivedCount += 1;
      receiver.netBalance += amount;
    });
  });

  return [...stats.values()]
    .map((player) => ({
      ...player,
      averageLoot: player.splitCount ? Math.round(player.totalLoot / player.splitCount) : 0,
    }))
    .sort((a, b) => b.totalLoot - a.totalLoot || a.name.localeCompare(b.name, 'uk'));
}

export function exportHistory(entries) {
  return JSON.stringify(Array.isArray(entries) ? entries : [], null, 2);
}

export function importHistory(currentEntries, importedJson) {
  let parsed;

  try {
    parsed = JSON.parse(importedJson);
  } catch {
    throw new Error('JSON журналу не читається');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('JSON має містити масив записів журналу');
  }

  const current = Array.isArray(currentEntries) ? currentEntries : [];
  const existingIds = new Set(current.map((entry) => entry.id));
  const incoming = parsed.filter((entry) => entry && typeof entry === 'object' && typeof entry.id === 'string');
  const fresh = incoming.filter((entry) => !existingIds.has(entry.id));

  return {
    entries: [...fresh, ...current],
    added: fresh.length,
    skipped: incoming.length - fresh.length,
  };
}
