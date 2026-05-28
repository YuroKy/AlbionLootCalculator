import { describe, expect, it } from 'vitest';
import {
  calculateSessionStats,
  createHistoryEntry,
  formatHistoryEntry,
  normalizeHistoryEntries,
  summarizeHistoryEntry,
} from '../lib/history';
import {
  applyDeductionsToParticipants,
  buildDiscordSummary,
  calculateDeductions,
  calculatePlayerStats,
  exportHistory,
  importHistory,
  parseParticipantImport,
  transactionKey,
} from '../lib/practical';
import {
  clampGroupSize,
  deserializeState,
  normalizeAppState,
  serializeState,
} from '../lib/state';
import {
  formatSilver,
  formatSilverInput,
  isValidSilverInput,
  normalizeSilverInput,
  parseSilverInput,
} from '../lib/silver';
import { splitLoot } from '../lib/splitLoot';

describe('splitLoot', () => {
  it('splits a balanced two player dungeon without transactions', () => {
    const result = splitLoot([
      { id: 'a', name: 'A', loot: 50 },
      { id: 'b', name: 'B', loot: 50 },
    ]);

    expect(result.baseShare).toBe(50);
    expect(result.remainder).toBe(0);
    expect(result.transactions).toEqual([]);
  });

  it('creates one payer to many receivers', () => {
    const result = splitLoot([
      { id: 'a', name: 'Tank', loot: 300 },
      { id: 'b', name: 'Healer', loot: 0 },
      { id: 'c', name: 'DPS', loot: 0 },
    ]);

    expect(result.transactions).toEqual([
      { fromId: 'a', fromName: 'Tank', toId: 'b', toName: 'Healer', amount: 100 },
      { fromId: 'a', fromName: 'Tank', toId: 'c', toName: 'DPS', amount: 100 },
    ]);
  });

  it('creates many payers to one receiver', () => {
    const result = splitLoot([
      { id: 'a', name: 'A', loot: 100 },
      { id: 'b', name: 'B', loot: 100 },
      { id: 'c', name: 'C', loot: 10 },
    ]);

    expect(result.transactions).toEqual([
      { fromId: 'a', fromName: 'A', toId: 'c', toName: 'C', amount: 30 },
      { fromId: 'b', fromName: 'B', toId: 'c', toName: 'C', amount: 30 },
    ]);
  });

  it('assigns remainder silver to the first participants', () => {
    const result = splitLoot([
      { id: 'a', name: 'A', loot: 4 },
      { id: 'b', name: 'B', loot: 0 },
      { id: 'c', name: 'C', loot: 0 },
    ]);

    expect(result.baseShare).toBe(1);
    expect(result.remainder).toBe(1);
    expect(result.balances.map((participant) => participant.targetShare)).toEqual([2, 1, 1]);
    expect(result.transactions).toEqual([
      { fromId: 'a', fromName: 'A', toId: 'b', toName: 'B', amount: 1 },
      { fromId: 'a', fromName: 'A', toId: 'c', toName: 'C', amount: 1 },
    ]);
  });

  it('supports a five player dungeon with zero loot participants', () => {
    const result = splitLoot([
      { id: 'a', name: 'A', loot: 500 },
      { id: 'b', name: 'B', loot: 0 },
      { id: 'c', name: 'C', loot: 0 },
      { id: 'd', name: 'D', loot: 0 },
      { id: 'e', name: 'E', loot: 0 },
    ]);

    expect(result.total).toBe(500);
    expect(result.baseShare).toBe(100);
    expect(result.transactions).toHaveLength(4);
    expect(result.transactions.reduce((sum, item) => sum + item.amount, 0)).toBe(400);
  });
});

describe('silver input helpers', () => {
  it('accepts integer silver values only', () => {
    expect(isValidSilverInput('12000')).toBe(true);
    expect(isValidSilverInput('1 200 000')).toBe(true);
    expect(isValidSilverInput('1,200,000')).toBe(true);
    expect(isValidSilverInput('')).toBe(true);
    expect(isValidSilverInput('0')).toBe(true);
    expect(isValidSilverInput('12.5')).toBe(false);
    expect(isValidSilverInput('-1')).toBe(false);
    expect(isValidSilverInput('abc')).toBe(false);
  });

  it('parses valid silver input', () => {
    expect(parseSilverInput('')).toBe(0);
    expect(parseSilverInput('00125')).toBe(125);
    expect(parseSilverInput('1 200 000')).toBe(1200000);
    expect(parseSilverInput('1,200,000')).toBe(1200000);
  });

  it('normalizes masked silver values', () => {
    expect(normalizeSilverInput(' 12 345 678 ')).toBe('12345678');
    expect(normalizeSilverInput('12,345,678')).toBe('12345678');
  });

  it('formats silver values with comma separators', () => {
    expect(formatSilver(1200000)).toBe('1,200,000');
    expect(formatSilverInput('1200000')).toBe('1,200,000');
    expect(formatSilverInput('1,2a0 0,000')).toBe('1,200,000');
  });
});

describe('practical helpers', () => {
  it('parses participant import text and reports invalid rows', () => {
    const result = parseParticipantImport('Alice 1,200,000\nBob: 850000\nbad row');

    expect(result.participants).toEqual([
      { id: 'player-1', name: 'Alice', loot: '1,200,000' },
      { id: 'player-2', name: 'Bob', loot: '850,000' },
    ]);
    expect(result.errors).toEqual([{ lineNumber: 3, message: 'очікується формат "Гравець 1,200,000"' }]);
  });

  it('limits imported participants to ten', () => {
    const text = Array.from({ length: 11 }, (_, index) => `P${index + 1} ${index + 1}`).join('\n');
    const result = parseParticipantImport(text);

    expect(result.participants).toHaveLength(10);
    expect(result.errors[0].message).toContain('максимум 10');
  });

  it('calculates deductions and adjusted participants without changing splitLoot API', () => {
    const deductions = calculateDeductions({ tax: '100', repair: '50', other: '' });
    const adjusted = applyDeductionsToParticipants(
      [
        { id: 'a', name: 'A', loot: 300 },
        { id: 'b', name: 'B', loot: 100 },
      ],
      deductions.total,
    );

    expect(deductions).toMatchObject({ tax: 100, repair: 50, other: 0, total: 150, invalidFields: [] });
    expect(adjusted.grossTotal).toBe(400);
    expect(adjusted.distributableTotal).toBe(250);
    expect(adjusted.participants.reduce((sum, participant) => sum + participant.loot, 0)).toBe(250);
  });

  it('caps deductions larger than total', () => {
    const adjusted = applyDeductionsToParticipants([{ id: 'a', name: 'A', loot: 100 }], 500);

    expect(adjusted.totalDeduction).toBe(100);
    expect(adjusted.distributableTotal).toBe(0);
    expect(adjusted.participants[0].loot).toBe(0);
  });

  it('builds plain text Discord summaries', () => {
    expect(
      buildDiscordSummary({
        grossTotal: 1200,
        deductions: { total: 200 },
        distributableTotal: 1000,
        baseShare: 500,
        transactions: [{ fromName: 'A', toName: 'B', amount: 100 }],
      }),
    ).toContain('A -> B: 100 silver');

    expect(buildDiscordSummary({ total: 100, baseShare: 50, transactions: [] })).toContain('Balanced');
  });
});

describe('state helpers', () => {
  it('clamps group sizes to the supported range', () => {
    expect(clampGroupSize(0)).toBe(1);
    expect(clampGroupSize(5)).toBe(5);
    expect(clampGroupSize(99)).toBe(10);
  });

  it('serializes and restores shareable state', () => {
    const state = {
      groupSize: 2,
      participants: [
        { id: 'player-1', name: 'Авангард', loot: '1,200,000' },
        { id: 'player-2', name: 'Містик', loot: '0' },
      ],
      deductions: { tax: '10,000', repair: '', other: '' },
    };

    expect(deserializeState(serializeState(state))).toEqual(state);
  });

  it('normalizes incoming app state', () => {
    expect(
      normalizeAppState({
        groupSize: 2,
        participants: [{ name: 'A', loot: 100 }, { name: 'B', loot: '0' }, { name: 'C' }],
        deductions: { tax: '1000' },
        paidTransactions: { a: 1 },
      }),
    ).toEqual({
      groupSize: 2,
      participants: [
        { id: 'player-1', name: 'A', loot: '100' },
        { id: 'player-2', name: 'B', loot: '0' },
      ],
      deductions: { tax: '1,000', repair: '', other: '' },
      paidTransactions: { a: true },
    });
  });
});

describe('history helpers', () => {
  const result = splitLoot([
    { id: 'a', name: 'A', loot: 300 },
    { id: 'b', name: 'B', loot: 0 },
    { id: 'c', name: 'C', loot: 0 },
  ]);

  it('creates a history entry snapshot', () => {
    const paidTransactions = {
      [transactionKey(result.transactions[0], 0)]: true,
    };
    const entry = createHistoryEntry({
      participants: [
        { id: 'a', name: 'A', loot: 350 },
        { id: 'b', name: 'B', loot: 0 },
        { id: 'c', name: 'C', loot: 0 },
      ],
      result,
      deductions: { tax: 50, repair: 0, other: 0, total: 50 },
      grossTotal: 350,
      distributableTotal: 300,
      paidTransactions,
      now: new Date('2026-05-27T10:00:00.000Z'),
    });

    expect(entry.createdAt).toBe('2026-05-27T10:00:00.000Z');
    expect(entry.total).toBe(300);
    expect(entry.grossTotal).toBe(350);
    expect(entry.deductions.total).toBe(50);
    expect(entry.baseShare).toBe(100);
    expect(entry.participants).toHaveLength(3);
    expect(entry.transactions[0]).toEqual({
      fromId: 'a',
      fromName: 'A',
      toId: 'b',
      toName: 'B',
      amount: 100,
      paid: true,
    });
  });

  it('summarizes a history entry', () => {
    const entry = createHistoryEntry({
      participants: result.balances,
      result,
      now: new Date('2026-05-27T10:00:00.000Z'),
    });

    expect(summarizeHistoryEntry(entry)).toEqual({
      playerCount: 3,
      transferCount: 2,
      largestPayer: 'A',
      largestReceiver: 'B',
    });
  });

  it('calculates empty and populated session stats', () => {
    expect(calculateSessionStats([])).toEqual({
      splitCount: 0,
      totalSilver: 0,
      averageTotal: 0,
      averageShare: 0,
      totalTransfers: 0,
      topPlayer: null,
      topPlayers: [],
    });

    const entry = createHistoryEntry({
      participants: result.balances,
      result,
      now: new Date('2026-05-27T10:00:00.000Z'),
    });

    expect(calculateSessionStats([entry])).toMatchObject({
      splitCount: 1,
      totalSilver: 300,
      averageTotal: 300,
      averageShare: 100,
      totalTransfers: 2,
      topPlayer: { name: 'A', loot: 300 },
    });
  });

  it('calculates player stats from history transactions', () => {
    const entry = createHistoryEntry({
      participants: result.balances,
      result,
      now: new Date('2026-05-27T10:00:00.000Z'),
    });

    expect(calculatePlayerStats([entry])).toEqual([
      expect.objectContaining({ name: 'A', totalLoot: 300, paidCount: 2, netBalance: -200 }),
      expect.objectContaining({ name: 'B', receivedCount: 1, netBalance: 100 }),
      expect.objectContaining({ name: 'C', receivedCount: 1, netBalance: 100 }),
    ]);
  });

  it('normalizes malformed history entries', () => {
    expect(normalizeHistoryEntries(null)).toEqual([]);
    expect(normalizeHistoryEntries([{ total: '500', transactions: 'bad' }])).toMatchObject([
      { total: 500, transactions: [], deductions: { tax: 0, repair: 0, other: 0, total: 0 } },
    ]);
  });

  it('formats a copyable history entry', () => {
    const entry = createHistoryEntry({
      participants: result.balances,
      result,
      now: new Date('2026-05-27T10:00:00.000Z'),
    });

    expect(formatHistoryEntry(entry, formatSilver)).toContain('A -> B: 100 silver');
  });

  it('exports and imports history without duplicates', () => {
    const entry = createHistoryEntry({
      participants: result.balances,
      result,
      now: new Date('2026-05-27T10:00:00.000Z'),
    });
    const json = exportHistory([entry]);

    expect(importHistory([], json)).toMatchObject({ added: 1, skipped: 0 });
    expect(importHistory([entry], json)).toMatchObject({ added: 0, skipped: 1 });
    expect(() => importHistory([], '{bad')).toThrow('JSON журналу не читається');
    expect(() => importHistory([], '{}')).toThrow('JSON має містити масив');
  });
});
