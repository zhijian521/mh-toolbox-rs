<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ModalShell from '../../components/ModalShell.vue';
import FoldedCard from '../../components/FoldedCard.vue';
import SelectField from '../../components/SelectField.vue';
import DateField from '../../components/DateField.vue';
import RecordPager from '../../components/RecordPager.vue';
import PressButton from '../../components/PressButton.vue';
import { useRoster } from './roster';
import { selectGrowthHistory } from './growth-history';

const PAGE_SIZE = 10;
const emit = defineEmits<{ close: [] }>();
const { roster } = useRoster();
const selected = ref(''),
    from = ref(''),
    to = ref(''),
    page = ref(1);
const options = computed(() => [
    { value: '', label: '全部角色' },
    ...roster.value.map((one) => ({ value: one.id, label: one.name })),
]);
const entries = computed(() =>
    selectGrowthHistory(roster.value, {
        characterId: selected.value,
        from: from.value,
        to: to.value,
    }),
);
const pages = computed(() => Math.max(1, Math.ceil(entries.value.length / PAGE_SIZE)));
const visible = computed(() =>
    entries.value
        .slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE)
        .map(({ character, entry }) => ({
            ...entry,
            name: character.name,
            characterId: character.id,
        })),
);
watch([selected, from, to], () => {
    page.value = 1;
});
watch(pages, (total) => {
    page.value = Math.min(page.value, total);
});
</script>

<template>
    <ModalShell title="成长历史" :width="780" :min-height="440" @close="emit('close')">
        <div class="growth-filters">
            <SelectField v-model="selected" :options="options" label="成长历史角色" />
            <DateField v-model="from" label="成长历史开始日期" :max="to" />
            <span>至</span>
            <DateField v-model="to" label="成长历史结束日期" :min="from" />
        </div>
        <div v-if="!entries.length" class="record-empty">暂无成长记录</div>
        <div v-else class="growth-list">
            <FoldedCard
                v-for="entry in visible"
                :key="`${entry.characterId}-${entry.id}`"
                as="article"
                spine="left"
                class="growth-entry"
            >
                <header class="growth-heading ticket-rule">
                    <strong>{{ entry.name }}</strong>
                    <div class="growth-meta">
                        <span>
                            {{
                                entry.source === 'goal'
                                    ? '目标更新'
                                    : entry.source === 'legacy'
                                      ? '旧版记录'
                                      : '角色修改'
                            }}
                        </span>
                        <time class="num" :datetime="entry.date">{{ entry.date }}</time>
                    </div>
                    <p v-if="entry.note" class="growth-note">{{ entry.note }}</p>
                </header>
                <dl v-if="entry.changes.length" class="growth-changes">
                    <div
                        v-for="(change, index) in entry.changes"
                        :key="index"
                        class="slip-row sm growth-change"
                    >
                        <dt>
                            <span class="growth-group">{{ change.group }}</span>
                            <span>{{ change.label }}</span>
                        </dt>
                        <dd>
                            <span class="growth-before">{{ change.from || '未记录' }}</span>
                            <span aria-hidden="true">→</span>
                            <b>{{ change.to || '未记录' }}</b>
                        </dd>
                    </div>
                </dl>
            </FoldedCard>
        </div>
        <template #footer>
            <RecordPager v-model="page" :pages="pages" />
            <PressButton text="关闭" label="关闭成长历史" @click="emit('close')" />
        </template>
    </ModalShell>
</template>

<style scoped>
.growth-filters {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto minmax(0, 1fr);
    gap: 8px;
    align-items: center;
    margin-bottom: 14px;
}
.growth-list {
    display: grid;
    gap: 12px;
}
.folded-card.growth-entry {
    --folded-pad-block: 10px;
    --folded-pad-inline: 12px;

    overflow-wrap: anywhere;
}
.growth-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 3px 12px;
    padding-bottom: 8px;
}
.growth-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    margin-inline-start: auto;
    color: var(--muted);
    font-size: var(--fs-mini);
}
.growth-meta time {
    white-space: nowrap;
}
.growth-heading strong {
    color: var(--ink);
    font-size: var(--fs-md);
    line-height: 1.45;
}
.growth-note {
    flex-basis: 100%;
    margin: 0;
    color: var(--muted);
    font-size: var(--fs-xs);
}
.growth-changes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, calc(300px * var(--fs-scale))), 1fr));
    gap: 6px 10px;
    margin: 9px 0 0;
}
.slip-row.growth-change {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: baseline;
    gap: 8px;
    min-height: 28px;
    height: auto;
    padding-block: 5px;
    color: var(--ink-2);
    font-size: var(--fs-sm);
}
.growth-change dt {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 1px 6px;
}
.growth-group {
    color: var(--muted);
    font-size: var(--fs-xs);
}
.growth-change dd {
    display: grid;
    grid-template-columns: repeat(3, auto);
    justify-content: end;
    align-items: baseline;
    gap: 5px;
    margin: 0;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
}
.growth-before {
    text-align: end;
}
.growth-change b {
    color: var(--num);
    font-size: var(--fs-base);
}
@media (max-width: 540px) {
    .growth-filters {
        grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    }
    .growth-filters > :first-child {
        grid-column: 1 / -1;
    }
}
</style>
