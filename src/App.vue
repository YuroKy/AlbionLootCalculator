<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import {
  ArrowRightLeft,
  Coins,
  Copy,
  Crown,
  Eraser,
  Gem,
  HandCoins,
  Link2,
  Minus,
  PackageOpen,
  Plus,
  RotateCcw,
  Scale,
  ScrollText,
  ShieldAlert,
  Sparkles,
  Trash2,
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
const historyEntries = ref([]);
const copyStatus = ref('');
const completionStamp = ref(false);
let saveReady = false;
let copyStatusTimer;
let completionStampTimer;

onMounted(() => {
  const loadedState = loadInitialState();
  if (loadedState) {
    groupSize.value = loadedState.groupSize;
    participants.value = ensureParticipantCount(loadedState.participants, loadedState.groupSize);
  }

  historyEntries.value = loadHistoryEntries();
  saveReady = true;
});

watch(
  [groupSize, participants],
  () => {
    if (!saveReady) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentState()));
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

const hasInvalidLoot = computed(() =>
  participantValidation.value.some((participant) => !participant.isLootValid),
);

const lootResult = computed(() => {
  if (hasInvalidLoot.value) return null;

  return splitLoot(
    participants.value.map((participant) => ({
      id: participant.id,
      name: participant.name,
      loot: parseSilverInput(participant.loot),
    })),
  );
});

const balanceById = computed(() => {
  const balances = new Map();

  lootResult.value?.balances.forEach((participant) => {
    balances.set(participant.id, participant);
  });

  return balances;
});

const formattedTotal = computed(() => formatSilver(lootResult.value?.total ?? 0));
const formattedShare = computed(() => formatSilver(lootResult.value?.baseShare ?? 0));
const formattedRemainder = computed(() => formatSilver(lootResult.value?.remainder ?? 0));
const transactions = computed(() => lootResult.value?.transactions ?? []);
const hasTransfers = computed(() => transactions.value.length > 0);
const canAddParticipant = computed(() => participants.value.length < MAX_GROUP_SIZE);
const canRemoveParticipant = computed(() => participants.value.length > MIN_GROUP_SIZE);
const canCompleteDistribution = computed(() =>
  Boolean(!hasInvalidLoot.value && participants.value.length > 0 && lootResult.value),
);
const sessionStats = computed(() => calculateSessionStats(historyEntries.value));
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

function currentState() {
  return {
    groupSize: groupSize.value,
    participants: participants.value.map((participant) => ({
      id: participant.id,
      name: participant.name,
      loot: participant.loot,
    })),
  };
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
}

function removeParticipant() {
  if (!canRemoveParticipant.value) return;

  participants.value = participants.value.slice(0, -1);
  groupSize.value = participants.value.length;
}

function clearLoot() {
  participants.value = participants.value.map((participant) => ({
    ...participant,
    loot: '',
  }));
}

function fillZeroLoot() {
  participants.value = participants.value.map((participant) => ({
    ...participant,
    loot: '0',
  }));
}

function resetSample() {
  participants.value = createParticipants(groupSize.value);
}

function handleSilverInput(index, event) {
  participants.value[index].loot = formatSilverInput(event.target.value);
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

function handleSilverPaste(index, event) {
  event.preventDefault();
  participants.value[index].loot = formatSilverInput(event.clipboardData?.getData('text') ?? '');
}

function participantBalance(participantId) {
  return balanceById.value.get(participantId);
}

function participantLoot(participantId) {
  return participantBalance(participantId)?.loot ?? 0;
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

function copyTransferText() {
  if (hasInvalidLoot.value) return 'Є некоректні значення silver.';
  if (!hasTransfers.value) return `Лут збалансовано. Частка: ${formattedShare.value} silver.`;

  return transactions.value
    .map(
      (transaction) =>
        `${transaction.fromName} -> ${transaction.toName}: ${formatSilver(transaction.amount)} silver`,
    )
    .join('\n');
}

function shareUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set('state', serializeState(currentState()));

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

function copyShareLink() {
  copyToClipboard(shareUrl(), 'Лінк скопійовано');
}

function completeDistribution() {
  if (!canCompleteDistribution.value) return;

  const entry = createHistoryEntry({
    participants: lootResult.value.balances,
    result: lootResult.value,
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

function historySummary(entry) {
  return summarizeHistoryEntry(entry);
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
          <span>усього</span>
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
          <div class="search-slot">Dungeon party</div>
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

        <div class="action-bar" aria-label="Швидкі дії">
          <button type="button" :disabled="!canCompleteDistribution" @click="completeDistribution">
            <Sparkles :size="16" />
            <span>Завершити розподіл</span>
          </button>
          <button type="button" @click="copyTransfers">
            <Copy :size="16" />
            <span>Скопіювати перекази</span>
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

        <div class="summary-strip" aria-label="Підсумок луту">
          <article>
            <span>Усього срібла</span>
            <strong :key="formattedTotal">{{ formattedTotal }}</strong>
          </article>
          <article>
            <span>Базова частка</span>
            <strong :key="formattedShare">{{ formattedShare }}</strong>
          </article>
          <article>
            <span>Остача</span>
            <strong :key="formattedRemainder">{{ formattedRemainder }}</strong>
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
                @paste="handleSilverPaste(index, $event)"
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

        <div v-if="hasInvalidLoot" class="state-card warning">
          <ShieldAlert :size="31" />
          <strong>Некоректне значення silver</strong>
          <span>Вводь тільки цілі невід’ємні значення Albion silver.</span>
        </div>

        <div v-else-if="!hasTransfers" class="state-card success">
          <Sparkles :size="31" />
          <strong>Сховище збалансоване</strong>
          <span>Ніхто нікому не винен silver.</span>
        </div>

        <ol v-else class="transaction-list">
          <li
            v-for="transaction in transactions"
            :key="`${transaction.fromId}-${transaction.toId}-${transaction.amount}`"
          >
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
        <button type="button" :disabled="historyEntries.length === 0" @click="clearHistory">
          <Trash2 :size="16" />
          <span>Очистити журнал</span>
        </button>
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
          <strong>{{ sessionStats.topPlayer?.name ?? '—' }}</strong>
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

      <div class="history-panel" aria-labelledby="history-title">
        <div class="history-heading">
          <div>
            <p>Completed splits</p>
            <h2 id="history-title">Журнал розподілів</h2>
          </div>
        </div>

        <div v-if="historyEntries.length === 0" class="history-empty">
          <Sparkles :size="28" />
          <strong>Журнал порожній</strong>
          <span>Натисни “Завершити розподіл”, щоб додати перший запис.</span>
        </div>

        <div v-else class="history-table">
          <div class="history-head" aria-hidden="true">
            <span>Час</span>
            <span>Гравці</span>
            <span>Total</span>
            <span>Частка</span>
            <span>Перекази</span>
            <span>Топ</span>
            <span>Дії</span>
          </div>

          <div v-for="entry in historyEntries" :key="entry.id" class="history-row">
            <span>{{ historyTime(entry.createdAt) }}</span>
            <span>{{ historySummary(entry).playerCount }}</span>
            <strong>{{ formatSilver(entry.total) }}</strong>
            <span>{{ formatSilver(entry.baseShare) }}</span>
            <span>{{ historySummary(entry).transferCount }}</span>
            <span>{{ historySummary(entry).largestPayer }} → {{ historySummary(entry).largestReceiver }}</span>
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
