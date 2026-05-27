<script setup>
import { computed, ref, watch } from 'vue';
import {
  ArrowRightLeft,
  Coins,
  Crown,
  Gem,
  HandCoins,
  PackageOpen,
  Scale,
  ScrollText,
  ShieldAlert,
  Sparkles,
  Users,
} from '@lucide/vue';
import {
  GROUP_SIZES,
  isValidSilverInput,
  normalizeSilverInput,
  parseSilverInput,
  splitLoot,
} from './lib/splitLoot';

const defaultNames = ['Авангард', 'Містик', 'Рейнджер', 'Розбійник', 'Вартовий'];

const sampleLoot = {
  2: ['148000', '91000'],
  3: ['184500', '97500', '43000'],
  5: ['212000', '126500', '98000', '43000', '15500'],
};

const groupSize = ref(3);
const participants = ref(createParticipants(groupSize.value));

watch(groupSize, (nextSize, previousSize) => {
  const nextParticipants = createParticipants(nextSize).map((participant, index) => ({
    ...participant,
    ...(participants.value[index] ?? {}),
  }));

  if (nextSize > previousSize) {
    nextParticipants.slice(previousSize).forEach((participant, offset) => {
      participant.loot = formatSilverInput(sampleLoot[nextSize][previousSize + offset] ?? '0');
    });
  }

  participants.value = nextParticipants;
});

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

function createParticipants(size) {
  return Array.from({ length: size }, (_, index) => ({
    id: `player-${index + 1}`,
    name: defaultNames[index],
    loot: formatSilverInput(sampleLoot[size][index] ?? '0'),
  }));
}

function formatSilver(value) {
  return new Intl.NumberFormat('uk-UA').format(value);
}

function formatSilverInput(value) {
  const normalized = normalizeSilverInput(value).replace(/\D/g, '');
  if (normalized === '') return '';

  return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function handleSilverInput(index, event) {
  participants.value[index].loot = formatSilverInput(event.target.value);
}

function setGroupSize(size) {
  groupSize.value = size;
}

function participantBalance(participantId) {
  return balanceById.value.get(participantId);
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
        </div>

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
                autocomplete="off"
                aria-label="Лут у silver"
                @input="handleSilverInput(index, $event)"
              />
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
