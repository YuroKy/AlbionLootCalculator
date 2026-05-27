<script setup>
import { computed, ref, watch } from 'vue';
import {
  Coins,
  Crown,
  Gem,
  ScrollText,
  Shield,
  Sparkles,
  Users,
} from '@lucide/vue';
import {
  GROUP_SIZES,
  isValidSilverInput,
  parseSilverInput,
  splitLoot,
} from './lib/splitLoot';

const defaultNames = ['Vanguard', 'Mystic', 'Ranger', 'Reaver', 'Warden'];

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
      participant.loot = sampleLoot[nextSize][previousSize + offset] ?? '0';
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
    loot: sampleLoot[size][index] ?? '0',
  }));
}

function formatSilver(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

function setGroupSize(size) {
  groupSize.value = size;
}

function participantBalance(participantId) {
  return balanceById.value.get(participantId);
}

function balanceLabel(participantId) {
  const balance = participantBalance(participantId);
  if (!balance) return 'Pending';
  if (balance.balance > 0) return `Pays out ${formatSilver(balance.balance)}`;
  if (balance.balance < 0) return `Receives ${formatSilver(Math.abs(balance.balance))}`;
  return 'Balanced';
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
    <div class="ember-field" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
      <span />
    </div>

    <header class="app-header">
      <div class="brand-lockup">
        <div class="brand-mark">
          <Crown :size="28" stroke-width="1.8" />
        </div>
        <div>
          <p class="eyebrow">Albion Silver</p>
          <h1>Loot Tribunal</h1>
        </div>
      </div>

      <div class="vault-total" aria-live="polite">
        <Coins :size="20" />
        <span>{{ formattedTotal }}</span>
        <small>silver in vault</small>
      </div>
    </header>

    <main class="workspace">
      <section class="calculator-panel" aria-labelledby="split-title">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Dungeon Party</p>
            <h2 id="split-title">Equal Split Ledger</h2>
          </div>

          <div class="party-toggle" role="radiogroup" aria-label="Party size">
            <button
              v-for="size in GROUP_SIZES"
              :key="size"
              type="button"
              :class="{ active: groupSize === size }"
              :aria-checked="groupSize === size"
              role="radio"
              @click="setGroupSize(size)"
            >
              <Users :size="16" />
              <span>{{ size }}</span>
            </button>
          </div>
        </div>

        <div class="summary-strip">
          <article>
            <span>Total</span>
            <strong>{{ formattedTotal }}</strong>
          </article>
          <article>
            <span>Base share</span>
            <strong>{{ formattedShare }}</strong>
          </article>
          <article>
            <span>Remainder</span>
            <strong>{{ formattedRemainder }}</strong>
          </article>
        </div>

        <div class="party-ledger" aria-label="Party loot entries">
          <div
            v-for="(participant, index) in participantValidation"
            :key="participant.id"
            class="participant-row"
          >
            <div class="rank-gem">
              <Gem :size="16" />
              <span>{{ index + 1 }}</span>
            </div>

            <label>
              <span>Name</span>
              <input
                v-model="participants[index].name"
                type="text"
                autocomplete="off"
                spellcheck="false"
              />
            </label>

            <label class="silver-input">
              <span>Loot silver</span>
              <input
                v-model="participants[index].loot"
                :class="{ invalid: !participant.isLootValid }"
                inputmode="numeric"
                autocomplete="off"
                aria-label="Loot silver"
              />
            </label>

            <div class="balance-pill" :data-tone="balanceTone(participant.id)">
              {{ balanceLabel(participant.id) }}
            </div>
          </div>
        </div>
      </section>

      <aside class="result-panel" aria-live="polite">
        <div class="result-heading">
          <div class="seal">
            <ScrollText :size="24" stroke-width="1.7" />
          </div>
          <div>
            <p class="eyebrow">Settlement</p>
            <h2>Silver Oaths</h2>
          </div>
        </div>

        <div v-if="hasInvalidLoot" class="state-card warning">
          <Shield :size="28" />
          <strong>Invalid silver mark</strong>
          <span>Use whole Albion silver values only.</span>
        </div>

        <div v-else-if="!hasTransfers" class="state-card success">
          <Sparkles :size="28" />
          <strong>The vault is even</strong>
          <span>No one owes silver.</span>
        </div>

        <ol v-else class="transaction-list">
          <li
            v-for="transaction in transactions"
            :key="`${transaction.fromId}-${transaction.toId}-${transaction.amount}`"
          >
            <div class="transaction-icon">
              <Coins :size="18" />
            </div>
            <div>
              <strong>{{ transaction.fromName }}</strong>
              <span>gives {{ transaction.toName }}</span>
            </div>
            <b>{{ formatSilver(transaction.amount) }}</b>
          </li>
        </ol>

        <div class="rune-divider" aria-hidden="true">
          <span />
          <i />
          <span />
        </div>

        <div class="share-rules">
          <div>
            <span>Target share</span>
            <strong>{{ formattedShare }}</strong>
          </div>
          <div>
            <span>Bonus silver</span>
            <strong>first {{ lootResult?.remainder ?? 0 }}</strong>
          </div>
        </div>
      </aside>
    </main>
  </div>
</template>
