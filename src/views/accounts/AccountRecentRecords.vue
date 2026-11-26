<script setup lang="ts">
/** 最近记录只负责展示与回传原记录；编辑、自动账只读和保存由账号页面承接。 */
import { computed, inject } from 'vue';
import LedgerSection from '../../components/LedgerSection.vue';
import { glassLedger } from '../../components/glass-ledger';
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
const glass = inject(glassLedger, null);
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
        <ul v-else class="recent-list" aria-label="最近账号记录">
            <li v-for="one in rows" :key="one.entry.id">
                <component
                    :is="glass?.button ?? 'button'"
                    type="button"
                    :radius="glass ? 10 : undefined"
                    class="recent-row"
                    :aria-label="
                        one.description +
                        (one.entry.source === 'auto' ? '，查看详情' : '，修改记录')
                    "
                    :title="one.description"
                    @click="emit('edit', one.entry)"
                >
                    <span class="recent-copy">
                        <span class="recent-heading">
                            <span class="recent-title">{{ one.entry.category }}</span>
                            <span class="recent-amount" :class="one.entry.kind">{{
                                one.amount
                            }}</span>
                        </span>
                        <span class="recent-meta">
                            <time class="recent-date" :datetime="one.entry.date">{{
                                one.entry.date.slice(5)
                            }}</time>
                            <span class="recent-who">{{ one.who }}</span>
                            <span v-if="one.entry.channel" class="recent-channel">{{
                                one.entry.channel
                            }}</span>
                            <small v-if="one.entry.source === 'auto'" class="source-tag"
                                >自动</small
                            >
                        </span>
                    </span>
                </component>
            </li>
        </ul>
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
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 8px;
    margin: 0;
    padding: 2px;
    list-style: none;
}
.recent-list > li {
    min-width: 0;
    max-width: 100%;
}
.recent-row {
    --glass-button-height: auto;
    display: block;
    box-sizing: border-box;
    max-width: 100%;
    padding: 7px 11px;
    border-radius: 10px;
    color: var(--ink);
    font: inherit;
    text-align: start;
    cursor: pointer;
}
button.recent-row {
    border: var(--w-hair) solid var(--rule);
    background: var(--paper-2);
}
button.recent-row:hover {
    border-color: var(--rule-2);
    background: var(--well);
}
.recent-copy {
    display: grid;
    min-width: 0;
    gap: 3px;
    line-height: 1.35;
    white-space: normal;
    overflow-wrap: anywhere;
}
.recent-heading,
.recent-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
}
.recent-heading {
    justify-content: space-between;
    gap: 2px 10px;
    font-size: var(--fs-sm);
}
.recent-meta {
    gap: 2px 6px;
    color: var(--muted);
    font-size: var(--fs-mini);
}
.recent-date,
.recent-amount {
    font-variant-numeric: tabular-nums;
}
.source-tag {
    flex: none;
    padding: 1px 3px;
    border-radius: var(--r-1);
    background: var(--well);
    color: var(--muted);
    font-size: var(--fs-mini);
}
.income {
    color: var(--positive);
}
.expense {
    color: var(--negative);
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
