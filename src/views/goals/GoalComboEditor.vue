<script setup lang="ts">
/** 全部角色均可设置，只有已添加的项目参与目标；切换页签保留未完成输入。 */
import { computed, reactive, ref, useId, watch } from 'vue';
import NumberField from '../../components/NumberField.vue';
import PressButton from '../../components/PressButton.vue';
import SelectField from '../../components/SelectField.vue';
import SteppedSlider from '../../components/SteppedSlider.vue';
import { useRoster } from '../characters/roster';
import {
    METRIC_GROUPS,
    goalItemKey,
    groupKeys,
    metricGroup,
    metricValue,
    type GoalItem,
    type GoalMember,
    type MetricGroup,
} from './goals';

const props = defineProps<{ modelValue: GoalItem[]; members: GoalMember[]; disabled: boolean }>();
const emit = defineEmits<{
    'update:modelValue': [items: GoalItem[]];
    pending: [value: boolean];
    draft: [value: string];
}>();
const { roster } = useRoster();
const prefix = `combo-editor-${useId()}`;
const active = ref(props.members[0]?.id ?? roster.value[0]?.id ?? '');
const available = computed(() => [
    ...roster.value.map((one) => ({ id: one.id, name: one.name || '未命名' })),
    ...props.members.filter((member) => !roster.value.some((one) => one.id === member.id)),
]);
interface ItemDraft {
    group: MetricGroup;
    metric: string;
    target: number;
    open: boolean;
}
const drafts = reactive<Record<string, ItemDraft>>(Object.create(null));
watch(
    () => available.value.map((member) => member.id),
    (ids) => {
        if (!ids.includes(active.value)) active.value = ids[0] ?? '';
        for (const id of ids)
            drafts[id] ??= { group: 'training', metric: '', target: 0, open: false };
        for (const id of Object.keys(drafts)) if (!ids.includes(id)) delete drafts[id];
    },
    { immediate: true },
);
const emptyDraft = reactive<ItemDraft>({ group: 'training', metric: '', target: 0, open: false });
const currentDraft = computed(() => drafts[active.value] ?? emptyDraft);
const character = computed(() => roster.value.find((one) => one.id === active.value));
const currentRows = computed(() =>
    props.modelValue.filter((item) => item.characterId === active.value),
);
const tabs = computed(() =>
    available.value.map((member) => ({
        value: member.id,
        label: `${member.name}${roster.value.some((one) => one.id === member.id) ? '' : '（已删除）'} · ${props.modelValue.filter((item) => item.characterId === member.id).length}`,
    })),
);
const groups = METRIC_GROUPS.map((group) => ({ value: group.value, label: group.label }));
const metricOptions = computed(() =>
    groupKeys(currentDraft.value.group, character.value ? [character.value] : [])
        .filter(
            (key) =>
                !currentRows.value.some(
                    (item) =>
                        metricGroup(item.tracking) === currentDraft.value.group &&
                        item.tracking.key === key,
                ),
        )
        .map((key) => ({ value: key, label: key })),
);
watch(
    metricOptions,
    (options) => {
        if (!options.some((option) => option.value === currentDraft.value.metric))
            currentDraft.value.metric = options[0]?.value ?? '';
    },
    { immediate: true },
);
const pending = computed(() => Object.values(drafts).some((draft) => draft.open));
watch(pending, (value) => emit('pending', value), { immediate: true });
watch(
    drafts,
    () =>
        emit(
            'draft',
            Object.values(drafts).some((draft) => draft.open && draft.target > 0)
                ? JSON.stringify(drafts)
                : '',
        ),
    { deep: true },
);
const ready = computed(
    () =>
        !!character.value &&
        metricOptions.value.some((option) => option.value === currentDraft.value.metric) &&
        Number.isSafeInteger(currentDraft.value.target) &&
        currentDraft.value.target > 0,
);
const number = (value: number | null) =>
    value === null ? '待补录' : value.toLocaleString('zh-CN');
const groupLabel = (item: GoalItem) =>
    METRIC_GROUPS.find((group) => group.value === metricGroup(item.tracking))?.label;
function targetFor(item: GoalItem, target: number) {
    if (props.disabled) return;
    emit(
        'update:modelValue',
        props.modelValue.map((row) =>
            goalItemKey(row) === goalItemKey(item) ? { ...row, target } : row,
        ),
    );
}
function remove(item: GoalItem) {
    if (props.disabled) return;
    emit(
        'update:modelValue',
        props.modelValue.filter((row) => goalItemKey(row) !== goalItemKey(item)),
    );
}
function add() {
    if (props.disabled || !ready.value || !character.value) return;
    const draft = currentDraft.value;
    emit('update:modelValue', [
        ...props.modelValue,
        {
            characterId: character.value.id,
            tracking: {
                category: METRIC_GROUPS.find((group) => group.value === draft.group)!.category,
                key: draft.metric,
            },
            target: draft.target,
        },
    ]);
    draft.target = 0;
    draft.open = false;
}
function enter(event: KeyboardEvent) {
    if ((event.target as HTMLElement).tagName !== 'INPUT' || event.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    add();
}
function cancelAdd() {
    currentDraft.value.target = 0;
    currentDraft.value.open = false;
}
</script>

<template>
    <section class="combo-settings">
        <div v-if="tabs.length" class="combo-tabs-scroll">
            <SteppedSlider
                v-model="active"
                :options="tabs"
                as="tab"
                :prefix="prefix"
                label="组合角色"
                :disabled="disabled"
            />
        </div>
        <p v-else class="note">暂无角色，请先到角色页新增。</p>
        <section
            v-if="active"
            :id="`${prefix}-pane-${active}`"
            role="tabpanel"
            :aria-labelledby="`${prefix}-tab-${active}`"
            class="combo-projects"
        >
            <div v-if="currentRows.length" class="combo-table-scroll">
                <table class="ledger-table combo-items-table" aria-label="组合目标项目">
                    <colgroup>
                        <col />
                        <col class="combo-current-col" />
                        <col class="combo-target-col" />
                        <col class="combo-remove-col" />
                    </colgroup>
                    <thead>
                        <tr>
                            <th scope="col">项目 / 分类</th>
                            <th scope="col">当前值</th>
                            <th scope="col">目标值</th>
                            <th scope="col">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="item in currentRows" :key="goalItemKey(item)">
                            <td>
                                <div
                                    class="combo-project-name"
                                    :title="item.tracking.key + ' · ' + groupLabel(item)"
                                >
                                    <span>{{ item.tracking.key }}</span
                                    ><small>{{ groupLabel(item) }}</small>
                                </div>
                            </td>
                            <td class="combo-current">
                                {{
                                    character
                                        ? number(metricValue(character, item.tracking))
                                        : '已删除'
                                }}
                            </td>
                            <td>
                                <NumberField
                                    :model-value="item.target"
                                    :label="`${item.tracking.key}目标值`"
                                    update-on-input
                                    @update:model-value="targetFor(item, $event)"
                                />
                            </td>
                            <td class="combo-remove">
                                <PressButton
                                    icon="trash"
                                    :label="`移除${item.tracking.key}目标`"
                                    size="sm"
                                    :disabled="disabled"
                                    @click="remove(item)"
                                />
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <p v-if="!character" class="note">该角色已删除，可移除其目标设置。</p>
            <template v-else-if="currentDraft.open">
                <div class="combo-add-fields" @keydown.enter="enter">
                    <label class="form-field"
                        ><span>分类</span
                        ><SelectField
                            :model-value="currentDraft.group"
                            :options="groups"
                            label="组合项目分类"
                            :disabled="disabled"
                            @update:model-value="currentDraft.group = $event as MetricGroup"
                    /></label>
                    <label class="form-field"
                        ><span>项目</span
                        ><SelectField
                            v-model="currentDraft.metric"
                            :options="metricOptions"
                            label="组合具体项目"
                            placeholder="选择项目"
                            :disabled="disabled"
                    /></label>
                    <label class="form-field"
                        ><span>目标值</span
                        ><NumberField
                            v-model="currentDraft.target"
                            label="组合项目目标值"
                            update-on-input
                            zero-as-empty
                    /></label>
                </div>
                <div class="combo-add-actions">
                    <PressButton
                        text="取消添加"
                        label="取消添加项目"
                        size="sm"
                        :disabled="disabled"
                        @click="cancelAdd"
                    />
                    <PressButton
                        text="添加"
                        label="添加组合项目"
                        size="sm"
                        :disabled="disabled || !ready"
                        @click="add"
                    />
                </div>
            </template>
            <template v-else>
                <p v-if="!currentRows.length" class="note">尚未设置项目，不计入目标。</p>
                <PressButton
                    icon="add"
                    text="添加项目"
                    label="继续添加组合项目"
                    class="combo-add-button"
                    :disabled="disabled"
                    @click="currentDraft.open = true"
                />
            </template>
        </section>
    </section>
</template>

<style scoped>
.combo-settings,
.combo-projects {
    display: grid;
    gap: 14px;
    min-width: 0;
}
.combo-tabs-scroll {
    min-width: 0;
    overflow-x: auto;
    padding: 4px;
}
.combo-tabs-scroll :deep(.stepped) {
    min-width: 100%;
    width: max-content;
    --step-pad-y: 6px;
}
.combo-projects {
    padding-top: 12px;
    border-top: var(--w-hair) solid var(--rule);
}
.combo-table-scroll {
    min-width: 0;
    overflow-x: auto;
}
.combo-items-table {
    min-width: calc(440px * var(--fs-scale));
    table-layout: fixed;
}
.combo-current-col {
    width: calc(66px * var(--fs-scale));
}
.combo-target-col {
    width: calc(82px * var(--fs-scale));
}
.combo-remove-col {
    width: calc(34px * var(--fs-scale));
}
.combo-project-name {
    display: flex;
    align-items: baseline;
    gap: 10px;
    min-width: 0;
    color: var(--ink);
    white-space: nowrap;
}
.combo-project-name > span {
    overflow: hidden;
    text-overflow: ellipsis;
}
.combo-project-name small {
    flex: none;
    color: var(--muted);
    font-size: var(--fs-mini);
}
.combo-current {
    color: var(--num);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
.combo-remove {
    text-align: center;
}
.combo-items-table :deep(.number-field) {
    width: 100%;
}
.combo-add-fields {
    display: grid;
    grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) minmax(70px, 0.6fr);
    gap: 10px;
}
.combo-add-fields .form-field {
    min-width: 0;
    gap: 6px;
    color: var(--muted);
    font-size: var(--fs-xs);
    white-space: nowrap;
}
.combo-add-fields :deep(.number-field),
.combo-add-fields :deep(.select-field) {
    width: 100%;
}
.combo-add-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
}
.combo-add-button {
    justify-self: end;
    width: auto;
}
.note {
    margin: 0;
}
</style>
