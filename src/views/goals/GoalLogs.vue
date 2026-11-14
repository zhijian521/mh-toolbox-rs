<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import DateField from '../../components/DateField.vue';
import ModalShell from '../../components/ModalShell.vue';
import NumberField from '../../components/NumberField.vue';
import PressButton from '../../components/PressButton.vue';
import SegmentedPills from '../../components/SegmentedPills.vue';
import { useToday } from '../../composables/use-today';
import { signedText, type Goal, type GoalSummary } from './goals';
import type { LogInput } from './goals-store';

const props = defineProps<{
    goal: Goal;
    summary: GoalSummary;
    saving: boolean;
    locked: boolean;
    retrying: boolean;
    error: string;
    recorded: number;
}>();
const emit = defineEmits<{
    add: [input: LogInput];
    remove: [logId: string];
    retry: [];
    close: [];
}>();
const today = useToday();
const date = ref(today.value);
const direction = ref('add');
const delta = ref(0);
const note = ref('');
const ordered = computed(() =>
    [...props.goal.logs].sort((a, b) =>
        a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1,
    ),
);
const ready = computed(() => Number.isFinite(delta.value) && delta.value > 0 && !!date.value);
watch(
    () => props.recorded,
    () => {
        delta.value = 0;
        note.value = '';
    },
);
function submit() {
    if (props.saving || (!props.retrying && (props.locked || !ready.value))) return;
    emit('add', {
        date: date.value,
        delta: direction.value === 'add' ? delta.value : -delta.value,
        note: note.value,
    });
}
function enter(event: KeyboardEvent) {
    if ((event.target as HTMLElement).tagName !== 'INPUT' || event.isComposing) return;
    event.preventDefault();
    submit();
}
</script>

<template>
    <ModalShell title="进度记录" :width="600" :min-height="360" @close="!saving && emit('close')">
        <div class="record-summary">
            <span>{{ goal.title }}</span
            ><b
                >{{ summary.current.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) }} /
                {{ goal.target }} {{ goal.unit }}</b
            >
        </div>
        <form class="modal-form" @submit.prevent="submit" @keydown.enter="enter">
            <fieldset class="entry" :disabled="locked" :inert="locked">
                <SegmentedPills
                    v-model="direction"
                    :options="[
                        { value: 'add', label: '增加' },
                        { value: 'subtract', label: '减少' },
                    ]"
                    label="进度方向"
                    :disabled="locked"
                />
                <div class="entry-row">
                    <DateField v-model="date" label="记在哪一天" :max="today" :disabled="locked" />
                    <NumberField
                        v-model="delta"
                        label="这一笔的变化量"
                        update-on-input
                        :precision="goal.kind === 'gear' ? 0 : 2"
                        zero-as-empty
                    />
                    <span>{{ goal.unit }}</span>
                </div>
                <input
                    v-model="note"
                    class="field"
                    aria-label="备注"
                    placeholder="备注"
                    autocomplete="off"
                />
            </fieldset>
        </form>
        <ul v-if="ordered.length" class="logs">
            <li v-for="log in ordered" :key="log.id" class="log-row">
                <time :datetime="log.date">{{ log.date }}</time
                ><span class="delta">{{ signedText(log.delta, goal.unit) }}</span
                ><span class="note-text" :title="log.note">{{ log.note }}</span>
                <PressButton
                    class="remove"
                    icon="trash"
                    label="删掉这一笔"
                    size="sm"
                    danger
                    :disabled="locked"
                    @click="emit('remove', log.id)"
                />
            </li>
        </ul>
        <p v-else class="record-empty">暂无记录</p>
        <template #footer>
            <p v-if="error" class="note error save-error" role="alert">{{ error }}</p>
            <PressButton
                v-if="error && !retrying"
                text="重试保存"
                label="重试保存记录"
                :disabled="saving"
                @click="emit('retry')"
            />
            <PressButton
                data-modal-cancel
                text="关闭"
                label="关闭记录"
                :disabled="saving"
                @click="emit('close')"
            />
            <PressButton
                icon="check"
                :text="saving ? '保存中' : retrying ? '重试保存' : '记入'"
                label="记入这一笔"
                :disabled="saving || (!retrying && (locked || !ready))"
                seal
                @click="submit"
            />
        </template>
    </ModalShell>
</template>

<style scoped>
.record-summary {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 14px;
}
.record-summary span {
    min-width: 0;
    overflow-wrap: anywhere;
}
.record-summary b {
    color: var(--num);
    font-weight: 400;
    font-variant-numeric: tabular-nums;
}
.entry {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    min-width: 0;
    margin: 0;
    padding: 0 0 16px;
    border: 0;
}
.entry > .field {
    width: 100%;
}
.entry-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(100px, 1fr) auto;
    align-items: center;
    gap: 8px;
    width: 100%;
    color: var(--muted);
    font-size: var(--fs-sm);
}
.entry-row :deep(.number-field) {
    width: 100%;
}
.logs {
    margin: 0;
    padding: 0;
    list-style: none;
}
.log-row {
    display: grid;
    grid-template-columns: auto minmax(80px, auto) minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 9px 0;
    border-top: var(--w-hair) solid var(--rule);
    color: var(--muted);
    font-size: var(--fs-sm);
    font-variant-numeric: tabular-nums;
}
.delta {
    color: var(--num);
    white-space: nowrap;
}
.note-text {
    overflow: hidden;
    color: var(--ink-2);
    white-space: nowrap;
    text-overflow: ellipsis;
}
</style>
