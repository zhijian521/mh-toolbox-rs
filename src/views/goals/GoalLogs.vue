<script setup lang="ts">
import { computed, inject, ref, useId, watch } from 'vue';
import GlassDateField from '../../components/liquid-glass/GlassDateField.vue';
import GlassInput from '../../components/liquid-glass/GlassInput.vue';
import DateField from '../../components/DateField.vue';
import ModalShell from '../../components/ModalShell.vue';
import { glassLedger } from '../../components/glass-ledger';
import GlassNumberField from '../../components/liquid-glass/GlassNumberField.vue';
import NumberField from '../../components/NumberField.vue';
import PressButton from '../../components/PressButton.vue';
import FormActions from '../../components/FormActions.vue';
import SegmentedPills from '../../components/SegmentedPills.vue';
import { GlassSegment, GlassSegmented } from '../../components/liquid-glass';
import GoalReadouts from './GoalReadouts.vue';
import { useToday } from '../../composables/use-today';
import { useDraftGuard } from '../../composables/use-draft-guard';
import type { ReadonlyGoal, GoalSummary } from './goals';
import type { LogInput } from './goals-store';

const glass = inject(glassLedger, null);
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
    retry: [];
    close: [];
}>();
const today = useToday();
const date = ref(today.value);
const direction = ref('add');
const delta = ref(0);
const note = ref('');
const amountId = useId();
const directions = [
    { value: 'add', label: '增加' },
    { value: 'subtract', label: '减少' },
];
const readings = computed(() => [
    { key: 'name', label: '目标', text: props.goal.title },
    {
        key: 'progress',
        label: '当前 / 目标',
        text: `${props.summary.current.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} / ${props.goal.target.toLocaleString('zh-CN')}`,
        unit: props.goal.unit,
    },
]);
const entryOptions = () => `${date.value}:${direction.value}`;
let savedOptions = entryOptions();
const { requestClose } = useDraftGuard(
    () =>
        !props.retrying &&
        (delta.value !== 0 || !!note.value.trim() || entryOptions() !== savedOptions),
    () => props.saving,
    () => emit('close'),
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
    <ModalShell title="进度记录" :width="600" @close="requestClose">
        <form class="modal-form goal-log-form" :class="{ 'lg-form-fields': glass }" @submit.prevent="submit" @keydown.enter="enter">
            <GoalReadouts :items="readings" />
            <fieldset class="entry" :disabled="locked" :inert="locked">
                <GlassSegmented v-if="glass" v-model:value="direction" aria-label="进度方向">
                    <GlassSegment v-for="option in directions" :key="option.value" :value="option.value">
                        {{ option.label }}
                    </GlassSegment>
                </GlassSegmented>
                <SegmentedPills
                    v-else
                    v-model="direction"
                    :options="directions"
                    label="进度方向"
                    :disabled="locked"
                />
                <div class="entry-row">
                    <component :is="glass ? GlassDateField : DateField" v-model="date" label="记在哪一天" :max="today" :disabled="locked" />
                    <div class="entry-amount">
                        <label :for="amountId">变化数量（{{ goal.unit }}）</label>
                        <component
                            :is="glass ? GlassNumberField : NumberField"
                            :id="amountId"
                            v-model="delta"
                            label="这一笔的变化量"
                            update-on-input
                            :precision="goal.kind === 'gear' ? 0 : 2"
                            zero-as-empty
                        />
                    </div>
                </div>
                <GlassInput v-if="glass" v-model="note" aria-label="备注" placeholder="备注" autocomplete="off" />
                <input v-else
                    v-model="note"
                    class="field"
                    aria-label="备注"
                    placeholder="备注"
                    autocomplete="off"
                />
            </fieldset>
        </form>
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
.goal-log-form {
    display: grid;
    gap: 16px;
    width: 100%;
    max-width: none;
    margin: 0;
}
.entry {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    min-width: 0;
    margin: 0;
    padding: 0 0 16px;
    border: 0;
}
.entry > .field {
    width: 100%;
}
.entry > :is(glass-segmented, .pill-group) {
    align-self: flex-start;
}
.entry-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: end;
    gap: 8px;
    width: 100%;
    color: var(--muted);
    font-size: var(--fs-sm);
}
.entry-row :deep(.number-field) {
    width: 100%;
}
.entry-amount {
    display: grid;
    gap: 4px;
    min-width: 0;
}
.entry-amount > label {
    color: var(--muted);
    font-size: var(--fs-xs);
}
</style>
