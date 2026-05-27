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
const copyStatus = ref('');
let saveReady = false;
let copyStatusTimer;

onMounted(() => {
  const loadedState = loadInitialState();
  if (loadedState) {
    groupSize.value = loadedState.groupSize;
    participants.value = ensureParticipantCount(loadedState.participants, loadedState.groupSize);
  }

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

        <div class="summary-strip" aria-label="Підсумок луту">
          <article>
            <span>Усього срібла</span>
            <strong>{{ formattedTotal }}</strong>
          </article>
          <article>
            <span>Базова частка</span>
            <strong>{{ formattedShare }}</strong>
          </article>
          <article>
            <span>Остача</span>
            <strong>{{ formattedRemainder }}</strong>
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
  </div>
</template>
