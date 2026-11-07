<script setup lang="ts">
import { useToday } from '../../composables/use-today';
import { computed, ref } from 'vue';
import DateField from '../../components/DateField.vue';
import ModalShell from '../../components/ModalShell.vue';
import NumberField from '../../components/NumberField.vue';
import PressButton from '../../components/PressButton.vue';
import { askConfirm } from '../../composables/use-confirm';

import { signedText, type Goal, type GoalSummary } from './goals';
import type { LogInput } from './goals-store';

/**
 * 手动目标的流水。
 *
 * 记一笔与看流水放在同一个窗里：这两件事总是一起发生（看过才知道差多少、记完要确认）。
 * 旧仓把它们拆成两个弹窗，于是「记一笔 → 关掉 → 再点开历史」是三次点击。
 *
 * **不提供「改一笔」**：一条流水只有日期、增量、备注三项，改一项就等于重记一笔。
 * 多开一条「按 id 定位 → 保留 createdAt → 重算累计」的路径，正是最容易出现
 * 「改完累计没跟上」的地方——删了重记只有一条路径。
 */
const props = defineProps<{ goal: Goal; summary: GoalSummary }>();
const emit = defineEmits<{ add: [input: LogInput]; remove: [logId: string]; close: [] }>();

const today = useToday();
const date = ref(today.value);
const delta = ref(0);
const note = ref('');
const error = ref('');

const ordered = computed(() =>
    [...props.goal.logs].sort((a, b) =>
        a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1,
    ),
);

const ready = computed(() => delta.value !== 0);

function submit() {
    if (!ready.value) {
        error.value = '填一个不为 0 的数';
        return;
    }
    error.value = '';
    emit('add', { date: date.value, delta: delta.value, note: note.value });
    delta.value = 0;
    note.value = '';
}

async function remove(logId: string) {
    const ok = await askConfirm({
        title: '删掉这一笔？',
        note: '累计进度会跟着回退。删了没法撤回，只能重记一笔。',
        confirmText: '删除',
    });
    if (ok) emit('remove', logId);
}
</script>

<template>
    <ModalShell title="流水" :width="560" :min-height="360" @close="emit('close')">
        <p class="summary">
            <span>
                当前
                <b>{{ summary.current }}</b>
                / {{ summary.total }} {{ goal.unit }}
            </span>
            <span class="pct">{{ summary.pct }}%</span>
        </p>

        <!-- `PressButton` 是 `type="button"`，表单没有提交键，回车不会触发隐式提交。
             这里显式接住回车：记一笔是「填数 → 回车」的动作，不该逼人去点。 -->
        <form class="entry" @submit.prevent="submit" @keydown.enter.prevent="submit">
            <div class="entry-row">
                <DateField v-model="date" label="记在哪一天" :max="today" />
                <NumberField
                    v-model="delta"
                    label="这一笔的变化量"
                    :precision="goal.kind === 'money' ? 2 : 0"
                    zero-as-empty
                />
                <input
                    v-model="note"
                    class="field note"
                    type="text"
                    placeholder="这一笔是什么，选填"
                    aria-label="备注"
                    autocomplete="off"
                />
                <PressButton
                    icon="check"
                    text="记入"
                    label="记入这一笔"
                    :disabled="!ready"
                    seal
                    @click="submit"
                />
            </div>
            <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        </form>

        <ul v-if="ordered.length" class="logs">
            <li v-for="log in ordered" :key="log.id" class="log-row">
                <time :datetime="log.date">{{ log.date }}</time>
                <span class="delta" :class="{ up: log.delta > 0 }">
                    {{ signedText(log.delta, goal.unit) }}
                </span>
                <span class="note-text">{{ log.note }}</span>
                <button class="remove" aria-label="删掉这一笔" @click="remove(log.id)">删</button>
            </li>
        </ul>
        <p v-else class="hint empty">还没有流水</p>
    </ModalShell>
</template>

<style scoped>
.summary {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    margin: 0 0 10px;
    color: var(--muted);
    font-size: var(--fs-sm);
}
.summary b {
    color: var(--ink);
    font-weight: 400;
    font-variant-numeric: tabular-nums;
}
.summary .pct {
    color: var(--num);
    font-size: calc(var(--fs-base) * 1.15);
    font-variant-numeric: tabular-nums;
}
.entry {
    padding-bottom: 10px;
    border-bottom: var(--w-hair) solid var(--rule);
}
.entry-row {
    display: grid;
    grid-template-columns: 132px 104px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
}
.note {
    min-width: 0;
}
/* `NumberField` 自带 72 的宽度下限，在这里会缩在 104 的格子里留一条空。
 * 这一格要的是「和左边日期一样宽」，让它铺满自己的列。 */
.entry-row :deep(.number-field) {
    width: 100%;
}
.logs {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
}
.log-row {
    display: grid;
    grid-template-columns: 84px 84px minmax(0, 1fr) 28px;
    align-items: baseline;
    gap: 8px;
    padding: 6px 0;
    font-size: var(--fs-sm);
    border-bottom: var(--w-hair) solid color-mix(in srgb, var(--rule) 55%, transparent);
}
.log-row time {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
}
.log-row .delta {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
}
.log-row .delta.up {
    color: var(--num);
}
.note-text {
    overflow: hidden;
    color: var(--ink-2);
    white-space: nowrap;
    text-overflow: ellipsis;
}
.remove {
    justify-self: end;
    padding: 0 4px;
    border: 0;
    background: none;
    color: var(--muted);
    font-family: var(--font-ui);
    font-size: var(--fs-xs);
    cursor: pointer;
}
.remove:hover {
    color: var(--cinnabar);
}
.empty {
    margin-top: 14px;
}
.form-error {
    margin: 6px 0 0;
    color: var(--cinnabar);
    font-size: var(--fs-sm);
}
</style>
