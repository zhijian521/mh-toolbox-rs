<script setup lang="ts">
import { computed, reactive } from 'vue';
import ModalShell from '../../components/ModalShell.vue';
import NumberField from '../../components/NumberField.vue';
import FormActions from '../../components/FormActions.vue';
import { useRoster } from '../characters/roster';
import { metricValue, metricApplicable, type ReadonlyGoal } from './goals';
import { useDraftGuard } from '../../composables/use-draft-guard';

const props = defineProps<{
    goal: ReadonlyGoal;
    saving: boolean;
    locked: boolean;
    retrying: boolean;
    error: string;
}>();
const emit = defineEmits<{ save: [values: { id: string; value: number }[]]; close: [] }>();
const { roster } = useRoster();
const rows = computed(() =>
    props.goal.members.flatMap((member) => {
        const character = roster.value.find((one) => one.id === member.id);
        if (!character || !props.goal.tracking || !metricApplicable(character, props.goal.tracking))
            return [];
        return [
            {
                id: member.id,
                name: character.name || member.name || '未命名',
                value: metricValue(character, props.goal.tracking),
            },
        ];
    }),
);
const original = new Map(rows.value.map((row) => [row.id, row.value]));
const inputs = reactive<Record<string, number>>(
    Object.fromEntries(rows.value.map((row) => [row.id, row.value ?? 0])),
);
const touched = reactive(new Set<string>());
const changed = computed(() =>
    rows.value.filter((row) => touched.has(row.id) && inputs[row.id] !== original.get(row.id)),
);
const { requestClose } = useDraftGuard(
    () => !props.retrying && changed.value.length > 0,
    () => props.saving,
    () => emit('close'),
);

function change(id: string, value: number) {
    inputs[id] = value;
    touched.add(id);
}
function submit() {
    if (props.saving || (!props.retrying && (!changed.value.length || props.locked))) return;
    emit(
        'save',
        changed.value.map((row) => ({ id: row.id, value: inputs[row.id] })),
    );
}
function enter(event: KeyboardEvent) {
    if ((event.target as HTMLElement).tagName !== 'INPUT' || event.isComposing) return;
    event.preventDefault();
    submit();
}
</script>

<template>
    <ModalShell title="更新进度" :width="460" @close="requestClose">
        <form class="modal-form" @submit.prevent="submit" @keydown.enter="enter">
            <p class="metric-title">
                {{ goal.tracking?.key }} <span>目标 {{ goal.target }} {{ goal.unit }}</span>
            </p>
            <fieldset class="growth" :disabled="locked" :inert="locked">
                <label v-for="row in rows" :key="row.id" class="growth-row">
                    <span class="who"
                        >{{ row.name }}<small v-if="row.value === null">待补录</small></span
                    >
                    <NumberField
                        :model-value="inputs[row.id]"
                        :label="`${row.name} 的当前值`"
                        update-on-input
                        @update:model-value="change(row.id, $event)"
                    />
                    <span class="unit">{{ goal.unit }}</span>
                </label>
            </fieldset>
        </form>
        <template #footer>
            <FormActions
                :error="error"
                error-role="alert"
                :cancel-disabled="saving"
                :submit-text="saving ? '保存中' : retrying ? '重试保存' : '保存'"
                submit-label="保存养成"
                :submit-disabled="saving || (!retrying && !changed.length)"
                @cancel="requestClose"
                @submit="submit"
            />
        </template>
    </ModalShell>
</template>

<style scoped>
.metric-title {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    margin: 0 0 14px;
    color: var(--ink);
    font-size: var(--fs-base);
}
.metric-title span,
.unit {
    color: var(--muted);
    font-size: var(--fs-sm);
}
.growth {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
}
.growth-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 100px auto;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    background: var(--paper-2);
    border-radius: var(--r-1);
}
.growth-row :deep(.number-field) {
    width: 100%;
}
.who {
    min-width: 0;
    color: var(--ink-2);
    font-size: var(--fs-sm);
    overflow-wrap: anywhere;
}
.who small {
    margin-left: 8px;
    color: var(--muted);
    font-size: var(--fs-xs);
}
</style>
