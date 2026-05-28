<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import {
  ArrowRightLeft,
  CheckCircle2,
  Coins,
  Copy,
  Crown,
  Download,
  Eraser,
  FileInput,
  Filter,
  Gem,
  HandCoins,
  Link2,
  MessageSquare,
  Minus,
  PackageOpen,
  Plus,
  RotateCcw,
  Scale,
  ScrollText,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
  Users,
} from '@lucide/vue';
import { GROUP_SIZES, splitLoot } from './lib/splitLoot';
import {
  HISTORY_STORAGE_KEY,
  calculateSessionStats,
  createHistoryEntry,
  formatHistoryEntry,
  normalizeHistoryEntries,
  summarizeHistoryEntry,
} from './lib/history';
import {
  applyDeductionsToParticipants,
  buildDiscordSummary,
  calculateDeductions,
  calculatePlayerStats,
  exportHistory,
  importHistory,
  parseParticipantImport,
  transactionKey,
} from './lib/practical';
import { formatSilver, formatSilverInput, isValidSilverInput, parseSilverInput } from './lib/silver';
import {
  MAX_GROUP_SIZE,
  MIN_GROUP_SIZE,
  STORAGE_KEY,
  clampGroupSize,
  deserializeState,
  normalizeAppState,
  serializeState,
} from './lib/state';

const defaultNames = ['Авангард', 'Містик', 'Рейнджер', 'Розбійник', 'Вартовий'];

const sampleLoot = {
  2: ['148000', '91000'],
  3: ['184500', '97500', '43000'],
  5: ['212000', '126500', '98000', '43000', '15500'],
};

const groupSize = ref(3);
const participants = ref(createParticipants(groupSize.value));
const deductions = ref({ tax: '', repair: '', other: '' });
const paidTransactions = ref({});
const historyEntries = ref([]);
const copyStatus = ref('');
const completionStamp = ref(false);
const importOpen = ref(false);
const importText = ref('');
const importErrors = ref([]);
const historyFilterPlayer = ref('');
const historyFilterMinTotal = ref('');
const backupText = ref('');
const backupError = ref('');
let saveReady = false;
let copyStatusTimer;
let completionStampTimer;

onMounted(() => {
  const loadedState = loadInitialState();
  if (loadedState) {
    groupSize.value = loadedState.groupSize;
    participants.value = ensureParticipantCount(loadedState.participants, loadedState.groupSize);
    deductions.value = loadedState.deductions;
    paidTransactions.value = loadedState.paidTransactions ?? {};
  }

  historyEntries.value = loadHistoryEntries();
  saveReady = true;
});

watch(
  [groupSize, participants, deductions, paidTransactions],
  () => {
    if (!saveReady) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentState({ includePaid: true })));
  },
  { deep: true },
);

watch(
  historyEntries,
  () => {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(historyEntries.value));
  },
  { deep: true },
);

const participantValidation = computed(() =>
  participants.value.map((participant) => ({
    ...participant,
    isLootValid: isValidSilverInput(participant.loot),
  })),
);

const deductionSummary = computed(() => calculateDeductions(deductions.value));
const hasInvalidLoot = computed(() =>
  participantValidation.value.some((participant) => !participant.isLootValid),
);
const hasInvalidDeductions = computed(() => deductionSummary.value.invalidFields.length > 0);
const hasInvalidInput = computed(() => hasInvalidLoot.value || hasInvalidDeductions.value);

const rawParticipants = computed(() =>
  participants.value.map((participant, index) => ({
    id: participant.id,
    name: participant.name?.trim() || `Учасник ${index + 1}`,
    loot: isValidSilverInput(participant.loot) ? parseSilverInput(participant.loot) : 0,
  })),
);

const distributionInput = computed(() =>
  applyDeductionsToParticipants(rawParticipants.value, deductionSummary.value.total),
);

const lootResult = computed(() => {
  if (hasInvalidInput.value) return null;
  return splitLoot(distributionInput.value.participants);
});

const balanceById = computed(() => {
  const balances = new Map();
  lootResult.value?.balances.forEach((participant) => {
    balances.set(participant.id, participant);
  });
  return balances;
});

const formattedGrossTotal = computed(() => formatSilver(distributionInput.value.grossTotal));
const formattedDeductions = computed(() => formatSilver(distributionInput.value.totalDeduction));
const formattedTotal = computed(() => formatSilver(lootResult.value?.total ?? 0));
const formattedShare = computed(() => formatSilver(lootResult.value?.baseShare ?? 0));
const formattedRemainder = computed(() => formatSilver(lootResult.value?.remainder ?? 0));
const transactions = computed(() => lootResult.value?.transactions ?? []);
const transactionRows = computed(() =>
  transactions.value.map((transaction, index) => {
    const key = transactionKey(transaction, index);
    return {
      ...transaction,
      key,
      paid: Boolean(paidTransactions.value[key]),
    };
  }),
);
const hasTransfers = computed(() => transactions.value.length > 0);
const paidCount = computed(() => transactionRows.value.filter((transaction) => transaction.paid).length);
const canAddParticipant = computed(() => participants.value.length < MAX_GROUP_SIZE);
const canRemoveParticipant = computed(() => participants.value.length > MIN_GROUP_SIZE);
const canCompleteDistribution = computed(() =>
  Boolean(!hasInvalidInput.value && participants.value.length > 0 && lootResult.value),
);
const hasExcessDeductions = computed(
  () => deductionSummary.value.total > distributionInput.value.grossTotal && distributionInput.value.grossTotal > 0,
);
const sessionStats = computed(() => calculateSessionStats(historyEntries.value));
const playerStats = computed(() => calculatePlayerStats(historyEntries.value));
const playerNetBars = computed(() => {
  const topPlayers = [...playerStats.value]
    .sort((a, b) => Math.abs(b.netBalance) - Math.abs(a.netBalance))
    .slice(0, 6);
  const maxNet = Math.max(...topPlayers.map((player) => Math.abs(player.netBalance)), 1);

  return topPlayers.map((player) => ({
    name: player.name,
    value: player.netBalance,
    tone: player.netBalance >= 0 ? 'receive' : 'pay',
    width: `${Math.max(8, Math.round((Math.abs(player.netBalance) / maxNet) * 100))}%`,
  }));
});
const totalChartBars = computed(() => {
  const maxTotal = Math.max(...historyEntries.value.map((entry) => entry.total), 1);

  return historyEntries.value.slice(0, 8).map((entry) => ({
    id: entry.id,
    label: shortTime(entry.createdAt),
    value: entry.total,
    width: `${Math.max(8, Math.round((entry.total / maxTotal) * 100))}%`,
  }));
});
const transferChartBars = computed(() => {
  const maxTransfers = Math.max(...historyEntries.value.map((entry) => entry.transactions.length), 1);

  return historyEntries.value.slice(0, 8).map((entry) => ({
    id: entry.id,
    label: shortTime(entry.createdAt),
    value: entry.transactions.length,
    width: `${Math.max(8, Math.round((entry.transactions.length / maxTransfers) * 100))}%`,
  }));
});
const topPlayerBars = computed(() => {
  const maxLoot = Math.max(...sessionStats.value.topPlayers.map((player) => player.loot), 1);

  return sessionStats.value.topPlayers.map((player) => ({
    name: player.name,
    value: player.loot,
    width: `${Math.max(8, Math.round((player.loot / maxLoot) * 100))}%`,
  }));
});
const availableHistoryPlayers = computed(() =>
  [...new Set(historyEntries.value.flatMap((entry) => entry.participants.map((participant) => participant.name)))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'uk')),
);
const filteredHistoryEntries = computed(() => {
  const player = historyFilterPlayer.value;
  const minTotal = parseSilverInput(historyFilterMinTotal.value);

  return historyEntries.value.filter((entry) => {
    const matchesPlayer = !player || entry.participants.some((participant) => participant.name === player);
    const matchesTotal = !minTotal || entry.total >= minTotal;
    return matchesPlayer && matchesTotal;
  });
});

function loadInitialState() {
  const queryState = normalizeAppState(
    deserializeState(new URLSearchParams(window.location.search).get('state')),
  );
  if (queryState) return queryState;

  const savedState = localStorage.getItem(STORAGE_KEY);
  if (!savedState) return null;

  try {
    return normalizeAppState(JSON.parse(savedState));
  } catch {
    return null;
  }
}

function loadHistoryEntries() {
  const savedHistory = localStorage.getItem(HISTORY_STORAGE_KEY);
  if (!savedHistory) return [];

  try {
    return normalizeHistoryEntries(JSON.parse(savedHistory));
  } catch {
    return [];
  }
}

function currentState({ includePaid = false } = {}) {
  const state = {
    groupSize: groupSize.value,
    participants: participants.value.map((participant) => ({
      id: participant.id,
      name: participant.name,
      loot: participant.loot,
    })),
    deductions: { ...deductions.value },
  };

  if (includePaid) state.paidTransactions = { ...paidTransactions.value };
  return state;
}

function createParticipants(size) {
  return Array.from({ length: clampGroupSize(size) }, (_, index) => createParticipant(index, size));
}

function createParticipant(index, size = groupSize.value) {
  const sample = sampleLoot[size]?.[index] ?? '0';

  return {
    id: `player-${index + 1}`,
    name: defaultNames[index] ?? `Учасник ${index + 1}`,
    loot: formatSilverInput(sample),
  };
}

function ensureParticipantCount(sourceParticipants, nextSize) {
  const size = clampGroupSize(nextSize);
  const nextParticipants = Array.from({ length: size }, (_, index) => ({
    ...createParticipant(index, size),
    ...(sourceParticipants[index] ?? {}),
  }));

  return nextParticipants.map((participant, index) => ({
    ...participant,
    id: participant.id || `player-${index + 1}`,
    name: participant.name || `Учасник ${index + 1}`,
    loot: formatSilverInput(participant.loot),
  }));
}

function setGroupSize(size) {
  const nextSize = clampGroupSize(size);
  groupSize.value = nextSize;
  participants.value = ensureParticipantCount(participants.value, nextSize);
  paidTransactions.value = {};
}

function addParticipant() {
  if (!canAddParticipant.value) return;

  const index = participants.value.length;
  participants.value = [
    ...participants.value,
    {
      ...createParticipant(index, index + 1),
      loot: '0',
    },
  ];
  groupSize.value = participants.value.length;
  paidTransactions.value = {};
}

function removeParticipant() {
  if (!canRemoveParticipant.value) return;

  participants.value = participants.value.slice(0, -1);
  groupSize.value = participants.value.length;
  paidTransactions.value = {};
}

function clearLoot() {
  participants.value = participants.value.map((participant) => ({
    ...participant,
    loot: '',
  }));
  paidTransactions.value = {};
}

function fillZeroLoot() {
  participants.value = participants.value.map((participant) => ({
    ...participant,
    loot: '0',
  }));
  paidTransactions.value = {};
}

function resetSample() {
  participants.value = createParticipants(groupSize.value);
  deductions.value = { tax: '', repair: '', other: '' };
  paidTransactions.value = {};
}

function handleSilverInput(index, event) {
  participants.value[index].loot = formatSilverInput(event.target.value);
  paidTransactions.value = {};
}

function handleDeductionInput(field, event) {
  deductions.value[field] = formatSilverInput(event.target.value);
  paidTransactions.value = {};
}

function handleSilverKeydown(event) {
  const allowedControlKeys = [
    'Backspace',
    'Delete',
    'Tab',
    'Enter',
    'Escape',
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'ArrowDown',
    'Home',
    'End',
  ];

  if (allowedControlKeys.includes(event.key) || event.ctrlKey || event.metaKey) return;
  if (/^\d$/.test(event.key)) return;

  event.preventDefault();
}

function handleSilverPaste(assign, event) {
  event.preventDefault();
  assign(formatSilverInput(event.clipboardData?.getData('text') ?? ''));
}

function handleParticipantPaste(index, event) {
  handleSilverPaste((value) => {
    participants.value[index].loot = value;
    paidTransactions.value = {};
  }, event);
}

function handleDeductionPaste(field, event) {
  handleSilverPaste((value) => {
    deductions.value[field] = value;
    paidTransactions.value = {};
  }, event);
}

function participantBalance(participantId) {
  return balanceById.value.get(participantId);
}

function participantLoot(participantId) {
  return rawParticipants.value.find((participant) => participant.id === participantId)?.loot ?? 0;
}

function participantTargetShare(participantId) {
  return participantBalance(participantId)?.targetShare ?? 0;
}

function balanceLabel(participantId) {
  const balance = participantBalance(participantId);
  if (!balance) return 'Очікує';
  if (balance.balance > 0) return `Віддає ${formatSilver(balance.balance)}`;
  if (balance.balance < 0) return `Отримує ${formatSilver(Math.abs(balance.balance))}`;
  return 'Збалансовано';
}

function balanceTone(participantId) {
  const balance = participantBalance(participantId);
  if (!balance) return 'neutral';
  if (balance.balance > 0) return 'pay';
  if (balance.balance < 0) return 'receive';
  return 'balanced';
}

function toggleTransactionPaid(key, checked) {
  paidTransactions.value = {
    ...paidTransactions.value,
    [key]: checked,
  };
}

function copyTransferText() {
  if (hasInvalidInput.value) return 'Є некоректні значення silver.';
  if (!hasTransfers.value) return `Лут збалансовано. Частка: ${formattedShare.value} silver.`;

  return transactions.value
    .map(
      (transaction) =>
        `${transaction.fromName} -> ${transaction.toName}: ${formatSilver(transaction.amount)} silver`,
    )
    .join('\n');
}

function currentDiscordSummary() {
  return buildDiscordSummary({
    grossTotal: distributionInput.value.grossTotal,
    deductions: deductionSummary.value,
    distributableTotal: lootResult.value?.total ?? 0,
    total: lootResult.value?.total ?? 0,
    baseShare: lootResult.value?.baseShare ?? 0,
    transactions: transactions.value,
  });
}

function shareUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set('state', serializeState(currentState({ includePaid: false })));

  return url.toString();
}

async function copyToClipboard(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    showCopyStatus(message);
  } catch {
    showCopyStatus('Не вдалося скопіювати');
  }
}

function copyTransfers() {
  copyToClipboard(copyTransferText(), 'Перекази скопійовано');
}

function copyDiscord() {
  copyToClipboard(currentDiscordSummary(), 'Discord summary скопійовано');
}

function copyShareLink() {
  copyToClipboard(shareUrl(), 'Лінк скопійовано');
}

function applyParticipantImport() {
  const result = parseParticipantImport(importText.value);
  importErrors.value = result.errors;

  if (result.participants.length === 0) {
    if (result.errors.length === 0) {
      importErrors.value = [{ lineNumber: 1, message: 'додай хоча б один рядок для імпорту' }];
    }
    return;
  }

  participants.value = result.participants;
  groupSize.value = result.participants.length;
  paidTransactions.value = {};
  showCopyStatus(
    result.errors.length
      ? `Імпортовано ${result.participants.length}, частину рядків пропущено`
      : `Імпортовано ${result.participants.length} гравців`,
  );
}

function completeDistribution() {
  if (!canCompleteDistribution.value) return;

  const entry = createHistoryEntry({
    participants: rawParticipants.value,
    result: lootResult.value,
    deductions: deductionSummary.value,
    grossTotal: distributionInput.value.grossTotal,
    distributableTotal: lootResult.value.total,
    paidTransactions: paidTransactions.value,
  });

  historyEntries.value = [entry, ...historyEntries.value].slice(0, 50);
  showCopyStatus('Розподіл завершено і додано в журнал');
  showCompletionStamp();
}

function copyHistoryEntry(entry) {
  copyToClipboard(formatHistoryEntry(entry, formatSilver), 'Запис журналу скопійовано');
}

function deleteHistoryEntry(entryId) {
  historyEntries.value = historyEntries.value.filter((entry) => entry.id !== entryId);
}

function clearHistory() {
  historyEntries.value = [];
  showCopyStatus('Журнал очищено');
}

function copyHistoryBackup() {
  copyToClipboard(exportHistory(historyEntries.value), 'JSON журналу скопійовано');
}

function mergeHistoryBackup() {
  backupError.value = '';
  try {
    const result = importHistory(historyEntries.value, backupText.value);
    historyEntries.value = normalizeHistoryEntries(result.entries).slice(0, 50);
    showCopyStatus(`Імпортовано ${result.added}, пропущено ${result.skipped}`);
  } catch (error) {
    backupError.value = error.message;
  }
}

function historySummary(entry) {
  return summarizeHistoryEntry(entry);
}

function paidHistoryCount(entry) {
  return (entry.transactions ?? []).filter((transaction) => transaction.paid).length;
}

function handleHistoryMinInput(event) {
  historyFilterMinTotal.value = formatSilverInput(event.target.value);
}

function handleHistoryMinPaste(event) {
  handleSilverPaste((value) => {
    historyFilterMinTotal.value = value;
  }, event);
}

function shortTime(value) {
  return new Intl.DateTimeFormat('uk-UA', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function historyTime(value) {
  return new Intl.DateTimeFormat('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function showCompletionStamp() {
  window.clearTimeout(completionStampTimer);
  completionStamp.value = false;
  window.requestAnimationFrame(() => {
    completionStamp.value = true;
    completionStampTimer = window.setTimeout(() => {
      completionStamp.value = false;
    }, 1400);
  });
}

function showCopyStatus(message) {
  window.clearTimeout(copyStatusTimer);
  copyStatus.value = message;
  copyStatusTimer = window.setTimeout(() => {
    copyStatus.value = '';
  }, 2200);
}
</script>

<template>
  <div class="app-shell">
    <header class="top-hud" aria-label="Підсумок калькулятора">
      <div class="player-plate">
        <div class="portrait-ring">
          <Crown :size="28" stroke-width="1.8" />
        </div>
        <div class="player-copy">
          <span>Albion Silver</span>
          <h1>Трибунал Луту</h1>
        </div>
      </div>

      <div class="hud-actions">
        <div class="hud-chip">
          <Coins :size="18" />
          <strong>{{ formattedTotal }}</strong>
          <span>до розподілу</span>
        </div>
        <div class="hud-chip">
          <Scale :size="18" />
          <strong>{{ formattedShare }}</strong>
          <span>частка</span>
        </div>
      </div>
    </header>

    <main class="game-window">
      <section class="market-window" aria-labelledby="split-title">
        <div class="window-titlebar">
          <div class="title-icon">
            <HandCoins :size="30" stroke-width="1.8" />
          </div>
          <div>
            <p>Caerleon Marketplace</p>
            <h2 id="split-title">Розподіл луту</h2>
          </div>
          <div class="title-total">
            <Coins :size="19" />
            <span>{{ formattedTotal }}</span>
          </div>
        </div>

        <div class="market-toolbar">
          <button type="button" class="search-slot import-toggle" @click="importOpen = !importOpen">
            <FileInput :size="16" />
            <span>Імпорт списку</span>
          </button>
          <div class="party-toggle" role="radiogroup" aria-label="Розмір групи">
            <button
              v-for="size in GROUP_SIZES"
              :key="size"
              type="button"
              :class="{ active: groupSize === size }"
              :aria-checked="groupSize === size"
              role="radio"
              @click="setGroupSize(size)"
            >
              <Users :size="15" />
              <span>{{ size }}</span>
            </button>
          </div>
          <div class="group-stepper" aria-label="Керування гравцями">
            <button
              type="button"
              :disabled="!canRemoveParticipant"
              aria-label="Прибрати гравця"
              @click="removeParticipant"
            >
              <Minus :size="15" />
            </button>
            <span>{{ participants.length }}/{{ MAX_GROUP_SIZE }}</span>
            <button
              type="button"
              :disabled="!canAddParticipant"
              aria-label="Додати гравця"
              @click="addParticipant"
            >
              <Plus :size="15" />
            </button>
          </div>
        </div>

        <div v-if="importOpen" class="import-panel">
          <label>
            <span>Список гравців</span>
            <textarea
              v-model="importText"
              rows="4"
              placeholder="Player A 1,200,000&#10;Player B: 850000"
            />
          </label>
          <button type="button" @click="applyParticipantImport">
            <Upload :size="16" />
            <span>Застосувати імпорт</span>
          </button>
          <div v-if="importErrors.length" class="notice warning">
            <strong>Є рядки, які не вдалося імпортувати</strong>
            <span v-for="error in importErrors" :key="`${error.lineNumber}-${error.message}`">
              Рядок {{ error.lineNumber }}: {{ error.message }}
            </span>
          </div>
        </div>

        <div class="action-bar" aria-label="Швидкі дії">
          <button type="button" :disabled="!canCompleteDistribution" @click="completeDistribution">
            <Sparkles :size="16" />
            <span>Завершити розподіл</span>
          </button>
          <button type="button" @click="copyTransfers">
            <Copy :size="16" />
            <span>Скопіювати перекази</span>
          </button>
          <button type="button" @click="copyDiscord">
            <MessageSquare :size="16" />
            <span>Для Discord</span>
          </button>
          <button type="button" @click="copyShareLink">
            <Link2 :size="16" />
            <span>Скопіювати лінк</span>
          </button>
          <button type="button" @click="clearLoot">
            <Eraser :size="16" />
            <span>Очистити лут</span>
          </button>
          <button type="button" @click="fillZeroLoot">
            <Trash2 :size="16" />
            <span>Заповнити нулями</span>
          </button>
          <button type="button" @click="resetSample">
            <RotateCcw :size="16" />
            <span>Скинути приклад</span>
          </button>
        </div>

        <p v-if="copyStatus" class="copy-status" role="status">{{ copyStatus }}</p>
        <p v-if="completionStamp" class="completion-stamp" aria-live="polite">Розподіл завершено</p>

        <div class="deductions-panel" aria-label="Вирахування перед розподілом">
          <div>
            <p>Вирахування перед розподілом</p>
            <strong>{{ formattedDeductions }} silver</strong>
          </div>
          <label v-for="item in deductionSummary.items" :key="item.key">
            <span>{{ item.label }}</span>
            <input
              :value="deductions[item.key]"
              :class="{ invalid: deductionSummary.invalidFields.includes(item.key) }"
              inputmode="numeric"
              autocomplete="off"
              @keydown="handleSilverKeydown"
              @paste="handleDeductionPaste(item.key, $event)"
              @input="handleDeductionInput(item.key, $event)"
            />
          </label>
        </div>

        <div v-if="hasExcessDeductions" class="notice warning inline-notice">
          <ShieldAlert :size="18" />
          <span>Вирахування більші за зібраний лут, тому до розподілу піде 0 silver.</span>
        </div>

        <div class="summary-strip" aria-label="Підсумок луту">
          <article>
            <span>Усього зібрано</span>
            <strong :key="formattedGrossTotal">{{ formattedGrossTotal }}</strong>
          </article>
          <article>
            <span>Вирахування</span>
            <strong :key="formattedDeductions">{{ formattedDeductions }}</strong>
          </article>
          <article>
            <span>До розподілу</span>
            <strong :key="formattedTotal">{{ formattedTotal }}</strong>
          </article>
          <article>
            <span>Базова частка</span>
            <strong :key="formattedShare">{{ formattedShare }}</strong>
          </article>
        </div>

        <div class="ledger-table" aria-label="Лут учасників групи">
          <div class="ledger-head" aria-hidden="true">
            <span>Гравець</span>
            <span>Лут у silver</span>
            <span>Баланс</span>
          </div>

          <div
            v-for="(participant, index) in participantValidation"
            :key="participant.id"
            class="participant-row"
            :data-tone="balanceTone(participant.id)"
          >
            <div class="player-cell">
              <div class="tier-badge">
                <Gem :size="15" />
                <span>{{ index + 1 }}</span>
              </div>
              <label>
                <span>Гравець</span>
                <input
                  v-model="participants[index].name"
                  type="text"
                  autocomplete="off"
                  spellcheck="false"
                  @input="paidTransactions = {}"
                />
              </label>
            </div>

            <label class="silver-input">
              <span>Лут у silver</span>
              <input
                :value="participants[index].loot"
                :class="{ invalid: !participant.isLootValid }"
                inputmode="numeric"
                pattern="[0-9]*"
                autocomplete="off"
                aria-label="Лут у silver"
                @keydown="handleSilverKeydown"
                @paste="handleParticipantPaste(index, $event)"
                @input="handleSilverInput(index, $event)"
              />
              <small>
                Ціль: {{ formatSilver(participantTargetShare(participant.id)) }} / Зібрав:
                {{ formatSilver(participantLoot(participant.id)) }}
              </small>
            </label>

            <div class="balance-pill" :data-tone="balanceTone(participant.id)">
              {{ balanceLabel(participant.id) }}
            </div>
          </div>
        </div>
      </section>

      <aside class="inventory-window" aria-live="polite">
        <div class="inventory-header">
          <div class="inventory-avatar">
            <ScrollText :size="28" stroke-width="1.7" />
          </div>
          <div>
            <p>Inventory</p>
            <h2>Перекази</h2>
          </div>
        </div>

        <div class="inventory-stats">
          <div>
            <Coins :size="17" />
            <span>{{ formattedTotal }}</span>
          </div>
          <div>
            <PackageOpen :size="17" />
            <span>{{ transactions.length }}</span>
          </div>
        </div>

        <div v-if="hasTransfers" class="transaction-progress">
          <span>{{ paidCount }} / {{ transactions.length }} сплачено</span>
          <div><i :style="{ width: `${Math.round((paidCount / transactions.length) * 100)}%` }" /></div>
        </div>

        <div v-if="hasInvalidInput" class="state-card warning">
          <ShieldAlert :size="31" />
          <strong>Некоректне значення silver</strong>
          <span>Вводь тільки цілі невідʼємні значення Albion silver.</span>
        </div>

        <div v-else-if="!hasTransfers" class="state-card success">
          <Sparkles :size="31" />
          <strong>Сховище збалансоване</strong>
          <span>Ніхто нікому не винен silver.</span>
        </div>

        <ol v-else class="transaction-list">
          <li
            v-for="transaction in transactionRows"
            :key="transaction.key"
            :class="{ paid: transaction.paid }"
          >
            <label class="transaction-paid">
              <input
                type="checkbox"
                :checked="transaction.paid"
                @change="toggleTransactionPaid(transaction.key, $event.target.checked)"
              />
              <CheckCircle2 :size="18" />
            </label>
            <div class="trade-icon">
              <ArrowRightLeft :size="18" />
            </div>
            <div class="trade-copy">
              <strong>{{ transaction.fromName }}</strong>
              <span>переказує {{ transaction.toName }}</span>
            </div>
            <b>{{ formatSilver(transaction.amount) }}</b>
          </li>
        </ol>

        <div class="inventory-footer">
          <div>
            <span>Цільова частка</span>
            <strong>{{ formattedShare }}</strong>
          </div>
          <div>
            <span>Остачу отримують</span>
            <strong>перші {{ lootResult?.remainder ?? 0 }}</strong>
          </div>
        </div>
      </aside>
    </main>

    <section class="session-dashboard" aria-labelledby="session-dashboard-title">
      <div class="dashboard-heading">
        <div>
          <p>Session board</p>
          <h2 id="session-dashboard-title">Статистика сесії</h2>
        </div>
        <div class="dashboard-actions">
          <button type="button" :disabled="historyEntries.length === 0" @click="copyHistoryBackup">
            <Download :size="16" />
            <span>Експорт журналу</span>
          </button>
          <button type="button" :disabled="historyEntries.length === 0" @click="clearHistory">
            <Trash2 :size="16" />
            <span>Очистити журнал</span>
          </button>
        </div>
      </div>

      <div class="stats-grid" aria-label="Підсумкова статистика">
        <article>
          <span>Розподілів</span>
          <strong>{{ sessionStats.splitCount }}</strong>
        </article>
        <article>
          <span>Усього silver</span>
          <strong>{{ formatSilver(sessionStats.totalSilver) }}</strong>
        </article>
        <article>
          <span>Середній total</span>
          <strong>{{ formatSilver(sessionStats.averageTotal) }}</strong>
        </article>
        <article>
          <span>Середня частка</span>
          <strong>{{ formatSilver(sessionStats.averageShare) }}</strong>
        </article>
        <article>
          <span>Переказів</span>
          <strong>{{ sessionStats.totalTransfers }}</strong>
        </article>
        <article>
          <span>Топ лутер</span>
          <strong>{{ sessionStats.topPlayer?.name ?? '-' }}</strong>
        </article>
      </div>

      <div class="charts-grid" aria-label="Графіки сесії">
        <article class="chart-panel">
          <h3>Total silver</h3>
          <div v-if="totalChartBars.length" class="bar-chart">
            <div v-for="bar in totalChartBars" :key="bar.id" class="chart-row">
              <span>{{ bar.label }}</span>
              <div><i :style="{ width: bar.width }" /></div>
              <b>{{ formatSilver(bar.value) }}</b>
            </div>
          </div>
          <p v-else>Заверши перший розподіл, щоб побачити графік.</p>
        </article>

        <article class="chart-panel">
          <h3>Кількість переказів</h3>
          <div v-if="transferChartBars.length" class="bar-chart transfer-chart">
            <div v-for="bar in transferChartBars" :key="bar.id" class="chart-row">
              <span>{{ bar.label }}</span>
              <div><i :style="{ width: bar.width }" /></div>
              <b>{{ bar.value }}</b>
            </div>
          </div>
          <p v-else>Поки немає завершених розподілів.</p>
        </article>

        <article class="chart-panel">
          <h3>Топ гравці за лутом</h3>
          <div v-if="topPlayerBars.length" class="bar-chart player-chart">
            <div v-for="bar in topPlayerBars" :key="bar.name" class="chart-row">
              <span>{{ bar.name }}</span>
              <div><i :style="{ width: bar.width }" /></div>
              <b>{{ formatSilver(bar.value) }}</b>
            </div>
          </div>
          <p v-else>Історія ще порожня.</p>
        </article>
      </div>

      <div class="player-stats-panel">
        <div class="history-heading">
          <div>
            <p>Player ledger</p>
            <h2>Статистика гравців</h2>
          </div>
        </div>
        <div v-if="playerNetBars.length" class="bar-chart net-chart">
          <div v-for="bar in playerNetBars" :key="bar.name" class="chart-row">
            <span>{{ bar.name }}</span>
            <div><i :data-tone="bar.tone" :style="{ width: bar.width }" /></div>
            <b>{{ formatSilver(bar.value) }}</b>
          </div>
        </div>
        <div v-if="playerStats.length" class="player-stats-table">
          <div class="player-stats-head" aria-hidden="true">
            <span>Гравець</span>
            <span>Лут</span>
            <span>Рани</span>
            <span>Середнє</span>
            <span>Платив</span>
            <span>Отримував</span>
            <span>Net</span>
          </div>
          <div v-for="player in playerStats" :key="player.name" class="player-stats-row">
            <strong>{{ player.name }}</strong>
            <span>{{ formatSilver(player.totalLoot) }}</span>
            <span>{{ player.splitCount }}</span>
            <span>{{ formatSilver(player.averageLoot) }}</span>
            <span>{{ player.paidCount }}</span>
            <span>{{ player.receivedCount }}</span>
            <b :data-tone="player.netBalance >= 0 ? 'receive' : 'pay'">{{ formatSilver(player.netBalance) }}</b>
          </div>
        </div>
        <p v-else>Заверши розподіл, щоб зібрати статистику по гравцях.</p>
      </div>

      <div class="backup-panel">
        <label>
          <span>Імпорт журналу з JSON</span>
          <textarea v-model="backupText" rows="3" placeholder="Встав JSON журналу сюди" />
        </label>
        <button type="button" @click="mergeHistoryBackup">
          <Upload :size="16" />
          <span>Імпорт журналу</span>
        </button>
        <p v-if="backupError" class="notice warning">{{ backupError }}</p>
      </div>

      <div class="history-panel" aria-labelledby="history-title">
        <div class="history-heading">
          <div>
            <p>Completed splits</p>
            <h2 id="history-title">Журнал розподілів</h2>
          </div>
        </div>

        <div class="history-filters" aria-label="Фільтри журналу">
          <label>
            <Filter :size="15" />
            <span>Гравець</span>
            <select v-model="historyFilterPlayer">
              <option value="">Усі</option>
              <option v-for="player in availableHistoryPlayers" :key="player" :value="player">
                {{ player }}
              </option>
            </select>
          </label>
          <label>
            <Coins :size="15" />
            <span>Мін. total</span>
            <input
              :value="historyFilterMinTotal"
              inputmode="numeric"
              autocomplete="off"
              @keydown="handleSilverKeydown"
              @paste="handleHistoryMinPaste"
              @input="handleHistoryMinInput"
            />
          </label>
        </div>

        <div v-if="historyEntries.length === 0" class="history-empty">
          <Sparkles :size="28" />
          <strong>Журнал порожній</strong>
          <span>Натисни "Завершити розподіл", щоб додати перший запис.</span>
        </div>

        <div v-else-if="filteredHistoryEntries.length === 0" class="history-empty">
          <ShieldAlert :size="28" />
          <strong>Нічого не знайдено</strong>
          <span>Зміни фільтри журналу.</span>
        </div>

        <div v-else class="history-table">
          <div class="history-head" aria-hidden="true">
            <span>Час</span>
            <span>Гравці</span>
            <span>Total</span>
            <span>Частка</span>
            <span>Перекази</span>
            <span>Сплачено</span>
            <span>Топ</span>
            <span>Дії</span>
          </div>

          <div v-for="entry in filteredHistoryEntries" :key="entry.id" class="history-row">
            <span>{{ historyTime(entry.createdAt) }}</span>
            <span>{{ historySummary(entry).playerCount }}</span>
            <strong>{{ formatSilver(entry.total) }}</strong>
            <span>{{ formatSilver(entry.baseShare) }}</span>
            <span>{{ historySummary(entry).transferCount }}</span>
            <span>{{ paidHistoryCount(entry) }} / {{ entry.transactions.length }}</span>
            <span>{{ historySummary(entry).largestPayer }} -> {{ historySummary(entry).largestReceiver }}</span>
            <div class="history-actions">
              <button type="button" @click="copyHistoryEntry(entry)">Скопіювати</button>
              <button type="button" @click="deleteHistoryEntry(entry.id)">Видалити</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
