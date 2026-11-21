<script setup lang="ts">
/** 组合更新保留全部角色的草稿，只有统一保存才回写名册。 */
import { computed, reactive, ref, useId } from 'vue';
import ModalShell from '../../components/ModalShell.vue';
import NumberField from '../../components/NumberField.vue';
import FormActions from '../../components/FormActions.vue';
import SteppedSlider from '../../components/SteppedSlider.vue';
import { useDraftGuard } from '../../composables/use-draft-guard';
import {
    groupComboRows,
    type ComboGoalRow,
    type ReadonlyGoal,
    type GoalProgressInput,
} from './goals';

const props = defineProps<{
    goal: ReadonlyGoal;
    rows: readonly ComboGoalRow[];
    initialCharacter?: string;
    saving: boolean;
    locked: boolean;
    retrying: boolean;
    error: string;
}>();
const emit = defineEmits<{ save: [values: GoalProgressInput[]]; close: [] }>();
const prefix = `combo-progress-${useId()}`;
const rows = props.rows;
const groups = groupComboRows(rows);
const active = ref(
    groups.find((group) => group.id === props.initialCharacter)?.id ??
        groups.find((group) => !group.done && group.total > 0)?.id ??
        groups[0]?.id ??
        '',
);
const inputs = reactive<Record<string, number>>(
    Object.fromEntries(rows.map((row) => [row.id, row.value ?? 0])),
);
const touched = reactive(new Set<string>());
const changed = computed(() =>
    rows.filter((row) => touched.has(row.id) && inputs[row.id] !== row.value),
);
const tabs = computed(() =>
    groupComboRows(
        rows.map((row) => ({
            ...row,
            done:
                row.exists &&
                row.applicable &&
                (row.value !== null || touched.has(row.id)) &&
                inputs[row.id] >= row.target,
        })),
    ).map((group) => ({
        value: group.id,
        label: `${group.name} · ${group.achieved}/${group.total}`,
    })),
);
const visible = computed(() => rows.filter((row) => row.characterId === active.value));
const valid = computed(
    () =>
        changed.value.length > 0 &&
        changed.value.every(
            (row) =>
                row.exists &&
                row.applicable &&
                Number.isSafeInteger(inputs[row.id]) &&
                inputs[row.id] >= 0,
        ),
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
    if (props.saving || (!props.retrying && (props.locked || !valid.value))) return;
    emit(
        'save',
        changed.value.map((row) => ({ id: row.id, value: inputs[row.id], previous: row.value })),
    );
}
function enter(event: KeyboardEvent) {
    if ((event.target as HTMLElement).tagName !== 'INPUT' || event.isComposing) return;
    event.preventDefault();
    submit();
}
</script>

<template>
    <ModalShell title="更新组合进度" :width="600" @close="requestClose">
        <form
            class="modal-form combo-progress-form"
            @submit.prevent="submit"
            @keydown.enter="enter"
        >
            <p class="combo-name">{{ goal.title }}</p>
            <fieldset :disabled="locked" :inert="locked">
                <div class="combo-tabs-scroll">
                    <SteppedSlider
                        v-model="active"
                        :options="tabs"
                        as="tab"
                        :prefix="prefix"
                        label="更新组合角色"
                        :disabled="locked"
                    />
                </div>
                <section
                    v-if="active"
                    :id="`${prefix}-pane-${active}`"
                    role="tabpanel"
                    :aria-labelledby="`${prefix}-tab-${active}`"
                    class="combo-value-list"
                >
                    <table class="ledger-table combo-progress-table" aria-label="组合项目进度">
                        <colgroup>
                            <col />
                            <col class="combo-input-col" />
                            <col class="combo-target-col" />
                            <col class="combo-state-col" />
                        </colgroup>
                        <thead>
                            <tr>
                                <th scope="col">项目</th>
                                <th scope="col">当前值</th>
                                <th scope="col">目标</th>
                                <th scope="col">状态</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr
                                v-for="row in visible"
                                :key="row.id"
                                class="combo-value-row"
                                :data-combo-item="row.id"
                            >
                                <td class="combo-metric" :title="row.tracking.key">
                                    {{ row.tracking.key }}
                                </td>
                                <td>
                                    <div
                                        v-if="row.exists && row.applicable"
                                        class="combo-current-input"
                                    >
                                        <NumberField
                                            :model-value="inputs[row.id]"
                                            :label="`${row.name}的${row.tracking.key}当前值`"
                                            update-on-input
                                            @update:model-value="change(row.id, $event)"
                                        />
                                        <small
                                            v-if="
                                                touched.has(row.id) && inputs[row.id] !== row.value
                                            "
                                            >原 {{ row.value ?? '待补录' }}</small
                                        >
                                    </div>
                                    <span v-else class="note">{{
                                        row.exists ? '不适用' : '已删除'
                                    }}</span>
                                </td>
                                <td class="combo-target">
                                    {{ row.target }}<small>{{ row.unit }}</small>
                                </td>
                                <td
                                    class="combo-state"
                                    :class="{
                                        complete:
                                            row.exists &&
                                            row.applicable &&
                                            (row.value !== null || touched.has(row.id)) &&
                                            inputs[row.id] >= row.target,
                                    }"
                                >
                                    {{
                                        !row.exists
                                            ? '已删除'
                                            : !row.applicable
                                              ? '不适用'
                                              : row.value === null && !touched.has(row.id)
                                                ? '待补录'
                                                : inputs[row.id] >= row.target
                                                  ? '已达标'
                                                  : '未达标'
                                    }}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </section>
                <p v-else class="note">暂无可更新的项目，请先编辑组合设置。</p>
            </fieldset>
            <p v-if="changed.length" class="note" aria-live="polite">
                已改 {{ changed.length }} 项 · 可切换角色继续修改
            </p>
        </form>
        <template #footer>
            <FormActions
                :error="error"
                error-role="alert"
                :cancel-disabled="saving"
                :submit-text="saving ? '保存中' : retrying ? '重试保存' : '保存更新'"
                submit-label="保存组合进度"
                :submit-disabled="saving || (!retrying && (!valid || locked))"
                submit-icon=""
                @cancel="requestClose"
                @submit="submit"
            />
        </template>
    </ModalShell>
</template>

<style scoped>
.combo-progress-form {
    display: grid;
    gap: 14px;
    max-width: none;
}
.combo-name {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-md);
    overflow-wrap: anywhere;
}
.note {
    margin: 0;
}
fieldset {
    display: grid;
    gap: 18px;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
}
.combo-tabs-scroll {
    overflow-x: auto;
    padding: 4px;
}
.combo-tabs-scroll :deep(.stepped) {
    min-width: 100%;
    width: max-content;
    --step-pad-y: 6px;
}
.combo-value-list {
    min-width: 0;
    overflow-x: auto;
    padding-top: 14px;
    border-top: var(--w-hair) solid var(--rule);
}
.combo-progress-table {
    min-width: calc(400px * var(--fs-scale));
    table-layout: fixed;
}
.combo-input-col {
    width: calc(98px * var(--fs-scale));
}
.combo-target-col {
    width: calc(82px * var(--fs-scale));
}
.combo-state-col {
    width: calc(65px * var(--fs-scale));
}
.combo-state {
    color: var(--muted);
    font-size: var(--fs-xs);
}
.combo-metric {
    color: var(--ink);
    font-size: var(--fs-base);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.combo-current-input {
    display: grid;
    gap: 4px;
}
.combo-current-input :deep(.number-field) {
    width: 100%;
}
.combo-current-input > small {
    color: var(--accent);
    font-size: var(--fs-mini);
}
.combo-target {
    color: var(--num);
    font-size: var(--fs-sm);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
.combo-state {
    white-space: nowrap;
}
.combo-target small {
    margin-left: 3px;
    color: var(--muted);
    font-size: var(--fs-mini);
}
.complete {
    color: var(--success);
}
</style>
