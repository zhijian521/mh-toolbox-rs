<script setup lang="ts">
/** 最近记录只负责展示与回传原记录；编辑、自动账只读和保存由账号页面承接。 */
import { computed } from 'vue';
import AppIcon from '../../components/AppIcon.vue';
import LedgerSection from '../../components/LedgerSection.vue';
import { ledgerMoneyText } from '../../services/format';
import type { ReadonlyCharacter } from '../characters/character';
import { characterName } from '../characters/roster';
import type { AccountEntry } from './accounts';

const props = defineProps<{
    entries: readonly AccountEntry[];
    roster: readonly ReadonlyCharacter[];
    error: string;
}>();
const emit = defineEmits<{ edit: [entry: AccountEntry] }>();
const rows = computed(() =>
    props.entries.map((entry) => {
        const who = characterName(props.roster, entry.characterId);
        const amount = ledgerMoneyText(
            entry.kind === 'expense' ? -entry.amount : entry.amount,
            entry.currency,
            { sign: 'always' },
        );
        const description = [entry.date, entry.category, who, entry.channel, amount, entry.note]
            .filter(Boolean)
            .join(' · ');
        return { entry, who, amount, description };
    }),
);
</script>

<template>
    <LedgerSection title="最近记录" class="records" plain>
        <p v-if="error || !rows.length" class="blank">
            {{ error ? '暂时无法读取记录，请重新读取。' : '这个范围还没有记录' }}
        </p>
        <div v-else class="recent-list" tabindex="0" aria-label="最近账号记录">
            <button
                v-for="one in rows"
                :key="one.entry.id"
                type="button"
                class="recent-row"
                :aria-label="
                    one.description + (one.entry.source === 'auto' ? '，查看详情' : '，修改记录')
                "
                :title="one.description"
                @click="emit('edit', one.entry)"
            >
                <span class="recent-date" :title="one.entry.date">{{ one.entry.date.slice(5) }}</span>
                <span class="recent-copy">
                    <span class="recent-title">
                        <span class="recent-category">{{ one.entry.category }}</span>
                        <small v-if="one.entry.source === 'auto'" class="source-tag">自动</small>
                    </span>
                    <span class="recent-meta">
                        <span class="recent-who">{{ one.who }}</span>
                        <span class="recent-channel">{{ one.entry.channel }}</span>
                    </span>
                </span>
                <span class="recent-amount" :class="one.entry.kind">{{ one.amount }}</span>
                <AppIcon name="chevron-right" class="recent-arrow" />
            </button>
        </div>
    </LedgerSection>
</template>

<style scoped>
.records {
    display: flex;
    flex-direction: column;
    min-width: 0;
}
.records :deep(.section-head) {
    flex: none;
}
.records :deep(.section-body) {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
}
.recent-list {
    flex: 1;
    min-height: 0;
    max-height: 240px;
    padding: 2px 4px;
    overflow-y: auto;
    scrollbar-gutter: stable;
}
.recent-row {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr) auto calc(12px * var(--fs-scale));
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: calc(54px * var(--fs-scale));
    padding: 9px 4px;
    border: 0;
    border-bottom: var(--w-hair) solid var(--rule);
    border-radius: var(--r-1);
    background: transparent;
    color: var(--ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: background-color var(--t-quick) var(--ease-soft);
}
.recent-row:last-child {
    border-bottom: 0;
}
.recent-row:hover {
    background: var(--paper-2);
}
.recent-copy {
    display: grid;
    gap: 3px;
    min-width: 0;
}
.recent-title,
.recent-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
}
.recent-title {
    font-size: var(--fs-sm);
}
.recent-category,
.recent-who,
.recent-channel {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.recent-who {
    flex: 0 1 auto;
}
.recent-channel {
    flex: 0 1 auto;
}
.recent-date,
.recent-meta {
    color: var(--muted);
    font-size: var(--fs-mini);
}
.recent-date,
.recent-amount {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
.source-tag {
    flex: none;
    padding: 1px 3px;
    border-radius: var(--r-1);
    background: var(--well);
    color: var(--muted);
    font-size: var(--fs-mini);
}
.recent-amount {
    font-size: var(--fs-sm);
    text-align: right;
}
.income {
    color: var(--positive);
}
.expense {
    color: var(--negative);
}
.recent-arrow {
    --icon-size: calc(12px * var(--fs-scale));
    color: var(--muted);
}
.blank {
    display: grid;
    flex: 1;
    place-items: center;
    min-height: 220px;
    margin: 0;
    color: var(--muted);
    font-size: var(--fs-sm);
}
</style>
