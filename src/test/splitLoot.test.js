import { describe, expect, it } from 'vitest';
import {
  isValidSilverInput,
  normalizeSilverInput,
  parseSilverInput,
  splitLoot,
} from '../lib/splitLoot';

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
    expect(isValidSilverInput('0')).toBe(true);
    expect(isValidSilverInput('12.5')).toBe(false);
    expect(isValidSilverInput('-1')).toBe(false);
    expect(isValidSilverInput('')).toBe(false);
  });

  it('parses valid silver input', () => {
    expect(parseSilverInput('00125')).toBe(125);
    expect(parseSilverInput('1 200 000')).toBe(1200000);
  });

  it('normalizes masked silver values', () => {
    expect(normalizeSilverInput(' 12 345 678 ')).toBe('12345678');
  });
});
