<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ModalShell from '../../components/ModalShell.vue';
import PressButton from '../../components/PressButton.vue';
import RecordPager from '../../components/RecordPager.vue';
import { useRoster } from '../characters/roster';
import { goalProgressHistory, type ReadonlyGoal } from './goals';

const props = defineProps<{ goal: ReadonlyGoal }>();
const emit = defineEmits<{ close: [] }>();
const { roster } = useRoster();
const page = ref(1);
const PAGE_SIZE = 10;
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
const pages = computed(() => Math.max(1, Math.ceil(rows.value.length / PAGE_SIZE)));
const visible = computed(() => rows.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE));
watch(pages, (total) => {
    page.value = Math.min(page.value, total);
});

function timeText(at: number, date: string) {
    const time = new Date(at);
    return at > 0 && Number.isFinite(time.getTime()) ? clock.format(time) : date;
}
</script>

<template>
    <ModalShell title="目标历史" :width="620" @close="emit('close')">
        <p class="history-title">{{ goal.title }}</p>
        <table v-if="rows.length" class="income-table progress-history" aria-label="目标更新历史">
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
        </table>
        <p v-else class="record-empty">暂无更新记录</p>
        <template #footer>
            <RecordPager v-if="pages > 1" v-model="page" :pages="pages" />
            <PressButton text="关闭" label="关闭目标历史" @click="emit('close')" />
        </template>
    </ModalShell>
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
</style>
