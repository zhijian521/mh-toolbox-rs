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
const pages = computed(() => Math.max(1, Math.ceil(entries.value.length / 10)));
const visible = computed(() =>
    entries.value.slice((page.value - 1) * 10, page.value * 10).map(({ character, entry }) => ({
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
                <header>
                    <strong>{{ entry.name }}</strong>
                    <span>
                        {{
                            entry.source === 'goal'
                                ? '目标更新'
                                : entry.source === 'legacy'
                                  ? '旧版记录'
                                  : '角色修改'
                        }}
                    </span>
                    <time>{{ entry.date }}</time>
                </header>
                <p v-if="entry.note" class="growth-note">{{ entry.note }}</p>
                <div v-for="(change, index) in entry.changes" :key="index" class="growth-change">
                    <span class="growth-group">{{ change.group }}</span>
                    <span>{{ change.label }}</span>
                    <span class="growth-before">{{ change.from || '未记录' }}</span>
                    <span aria-hidden="true">→</span>
                    <b>{{ change.to || '未记录' }}</b>
                </div>
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
    grid-template-columns: minmax(110px, 1fr) minmax(120px, 1fr) auto minmax(120px, 1fr);
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
    --folded-pad-inline: 14px;
}
.growth-entry header {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    align-items: baseline;
    margin-bottom: 6px;
    font-size: var(--fs-xs);
    color: var(--muted);
}
.growth-entry header strong {
    overflow-wrap: anywhere;
    font-size: var(--fs-sm);
    color: var(--ink);
}
.growth-entry time {
    margin-inline-start: auto;
    font-variant-numeric: tabular-nums;
}
.growth-note {
    margin: 0 0 6px;
    overflow-wrap: anywhere;
    font-size: var(--fs-xs);
    color: var(--muted);
}
.growth-change {
    display: grid;
    grid-template-columns: 82px minmax(90px, 1fr) minmax(75px, 1fr) 16px minmax(75px, 1fr);
    gap: 8px;
    align-items: baseline;
    padding: 5px 0;
    font-size: var(--fs-sm);
    border-top: var(--w-hair) solid var(--rule-2);
}
.growth-change > * {
    overflow-wrap: anywhere;
}
.growth-group,
.growth-before {
    color: var(--muted);
}
.growth-change > b {
    color: var(--num);
    font-variant-numeric: tabular-nums;
}
</style>
