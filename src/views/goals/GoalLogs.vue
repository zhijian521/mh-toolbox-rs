<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import DateField from '../../components/DateField.vue';
import ModalShell from '../../components/ModalShell.vue';
import NumberField from '../../components/NumberField.vue';
import PressButton from '../../components/PressButton.vue';
import FormActions from '../../components/FormActions.vue';
import SegmentedPills from '../../components/SegmentedPills.vue';
import { useToday } from '../../composables/use-today';
import { useDraftGuard } from '../../composables/use-draft-guard';
import { signedText, type ReadonlyGoal, type GoalSummary } from './goals';
import type { LogInput } from './goals-store';

const props = defineProps<{
    goal: ReadonlyGoal;
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
const entryOptions = () => `${date.value}:${direction.value}`;
let savedOptions = entryOptions();
const { requestClose } = useDraftGuard(
    () =>
        !props.retrying &&
        (delta.value !== 0 || !!note.value.trim() || entryOptions() !== savedOptions),
    () => props.saving,
    () => emit('close'),
);
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
        savedOptions = entryOptions();
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
    <ModalShell title="进度记录" :width="600" :min-height="360" @close="requestClose">
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
        <table v-if="ordered.length" class="income-table log-table" aria-label="进度流水">
            <thead>
                <tr>
                    <th scope="col">日期</th>
                    <th scope="col">变动</th>
                    <th scope="col">备注</th>
                    <th scope="col">操作</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="log in ordered" :key="log.id" class="log-row">
                    <td class="num">
                        <time :datetime="log.date">{{ log.date }}</time>
                    </td>
                    <td class="delta num">{{ signedText(log.delta, goal.unit) }}</td>
                    <td class="note-text">{{ log.note }}</td>
                    <td>
                        <span class="income-ops">
                            <PressButton
                                icon="trash"
                                label="删掉这一笔"
                                size="sm"
                                danger
                                :disabled="locked"
                                @click="emit('remove', log.id)"
                            />
                        </span>
                    </td>
                </tr>
            </tbody>
        </table>
        <p v-else class="record-empty">暂无记录</p>
        <template #footer>
            <FormActions
                :error="error"
                error-role="alert"
                cancel-text="关闭"
                cancel-label="关闭记录"
                :cancel-disabled="saving"
                :submit-text="saving ? '保存中' : retrying ? '重试保存' : '记入'"
                submit-label="记入这一笔"
                :submit-disabled="saving || (!retrying && (locked || !ready))"
                @cancel="requestClose"
                @submit="submit"
            >
                <PressButton
                    v-if="error && !retrying"
                    text="重试保存"
                    label="重试保存记录"
                    :disabled="saving"
                    @click="emit('retry')"
                />
            </FormActions>
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
.log-table :is(th, td):last-child {
    width: 1%;
    text-align: end;
    white-space: nowrap;
}
.log-table time,
.delta {
    white-space: nowrap;
}
.delta {
    color: var(--num);
}
.note-text {
    overflow-wrap: anywhere;
}
</style>
