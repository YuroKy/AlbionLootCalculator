export const GROUP_SIZES = [2, 3, 5];

export function splitLoot(participants) {
  const normalized = participants.map((participant, index) => ({
    id: participant.id ?? index,
    name: participant.name?.trim() || `Учасник ${index + 1}`,
    loot: participant.loot,
  }));

  const total = normalized.reduce((sum, participant) => sum + participant.loot, 0);
  const baseShare = Math.floor(total / normalized.length);
  const remainder = total % normalized.length;

  const balances = normalized.map((participant, index) => {
    const targetShare = baseShare + (index < remainder ? 1 : 0);
    return {
      ...participant,
      targetShare,
      balance: participant.loot - targetShare,
    };
  });

  const payers = balances
    .filter((participant) => participant.balance > 0)
    .map((participant) => ({ ...participant, remaining: participant.balance }));
  const receivers = balances
    .filter((participant) => participant.balance < 0)
    .map((participant) => ({ ...participant, remaining: Math.abs(participant.balance) }));

  const transactions = [];
  let payerIndex = 0;
  let receiverIndex = 0;

  while (payerIndex < payers.length && receiverIndex < receivers.length) {
    const payer = payers[payerIndex];
    const receiver = receivers[receiverIndex];
    const amount = Math.min(payer.remaining, receiver.remaining);

    if (amount > 0) {
      transactions.push({
        fromId: payer.id,
        fromName: payer.name,
        toId: receiver.id,
        toName: receiver.name,
        amount,
      });
    }

    payer.remaining -= amount;
    receiver.remaining -= amount;

    if (payer.remaining === 0) payerIndex += 1;
    if (receiver.remaining === 0) receiverIndex += 1;
  }

  return {
    total,
    baseShare,
    remainder,
    balances,
    transactions,
  };
}

export function isValidSilverInput(value) {
  const normalized = normalizeSilverInput(value);
  return normalized !== '' && /^\d+$/.test(normalized);
}

export function parseSilverInput(value) {
  return Number.parseInt(normalizeSilverInput(value), 10);
}

export function normalizeSilverInput(value) {
  return String(value ?? '').replace(/\s+/g, '').trim();
}
