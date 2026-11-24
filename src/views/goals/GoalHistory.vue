<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import PressButton from '../../components/PressButton.vue';
import GlassTable from '../../components/liquid-glass/GlassTable.vue';
import GlassEmptyState from '../../components/liquid-glass/GlassEmptyState.vue';
import RecordPager from '../../components/RecordPager.vue';
import { useRoster } from '../characters/roster';
import { goalProgressHistory, type ReadonlyGoal } from './goals';

const props = defineProps<{ goal: ReadonlyGoal; embedded?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const { roster } = useRoster();
const page = ref(1);
const pageSize = props.embedded ? 5 : 10;
const clock = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
});
const tracked = computed(() => props.goal.kind === 'combo' || !!props.goal.tracking);
const rows = computed(() => goalProgressHistory(props.goal, roster.value));
const pages = computed(() => Math.max(1, Math.ceil(rows.value.length / pageSize)));
const visible = computed(() =>
    rows.value.slice((page.value - 1) * pageSize, page.value * pageSize),
);
watch(pages, (total) => {
    page.value = Math.min(page.value, total);
});

function timeText(at: number, date: string) {
    const time = new Date(at);
    return at > 0 && Number.isFinite(time.getTime()) ? clock.format(time) : date;
}
</script>

<template>
    <section :class="{ 'history-content': embedded }">
        <header v-if="embedded" class="history-heading">
            <div><h2>目标历史</h2><p>{{ goal.title }}</p></div>
            <PressButton text="关闭" label="关闭目标历史" @click="emit('close')" />
        </header>
        <p v-else class="history-title">{{ goal.title }}</p>
        <div class="history-scroll">
            <component
                :is="embedded ? GlassTable : 'table'"
                v-if="rows.length"
                class="progress-history"
                :class="{ 'income-table': !embedded }"
                aria-label="目标更新历史"
            >
                <thead>
                    <tr>
                        <th scope="col">更新时间</th>
                        <th scope="col">{{ tracked ? '项目' : '备注' }}</th>
                        <th scope="col">变动</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="row in visible" :key="row.id">
                        <td class="when num">{{ timeText(row.at, row.date) }}</td>
                        <td>{{ row.name }}</td>
                        <td class="change num">{{ row.change }}</td>
                    </tr>
                </tbody>
            </component>
            <GlassEmptyState v-else-if="embedded">暂无更新记录</GlassEmptyState>
            <p v-else class="record-empty">暂无更新记录</p>
        </div>
        <RecordPager v-if="pages > 1" v-model="page" :pages="pages" label="目标历史分页" />
    </section>
</template>

<style scoped>
.history-title {
    margin: 0 0 12px;
    color: var(--ink-2);
    overflow-wrap: anywhere;
}
.progress-history td {
    overflow-wrap: anywhere;
}
.when {
    white-space: nowrap;
}
.change {
    color: var(--num);
    text-align: end;
}
.progress-history th:last-child {
    text-align: end;
}
.history-content {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    gap: 12px;
    padding: 6px 16px 14px;
}
.history-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.history-heading h2 { margin: 0; font-size: var(--fs-md); font-weight: 400; }
.history-heading p { margin: 3px 0 0; color: var(--liquid-muted); overflow-wrap: anywhere; }
.history-content .history-scroll { flex: 1; min-height: 0; overflow: auto; }
.history-content .when { color: var(--liquid-muted); white-space: normal; }
</style>
