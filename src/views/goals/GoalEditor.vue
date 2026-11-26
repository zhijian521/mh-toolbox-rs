<script setup lang="ts">
import { computed, inject, ref, useId, watch } from 'vue';
import { glassLedger } from '../../components/glass-ledger';
import { GlassSegment, GlassSegmented } from '../../components/liquid-glass';
import GlassMultiSelect from '../../components/liquid-glass/GlassMultiSelect.vue';
import GlassInput from '../../components/liquid-glass/GlassInput.vue';
import GlassDateField from '../../components/liquid-glass/GlassDateField.vue';
import GlassNumberField from '../../components/liquid-glass/GlassNumberField.vue';
import DateField from '../../components/DateField.vue';
import ModalShell from '../../components/ModalShell.vue';
import NumberField from '../../components/NumberField.vue';
import PressButton from '../../components/PressButton.vue';
import FormActions from '../../components/FormActions.vue';
import SegmentedPills from '../../components/SegmentedPills.vue';
import GlassSelect from '../../components/liquid-glass/GlassSelect.vue';
import SelectField from '../../components/SelectField.vue';
import TogglePills from '../../components/TogglePills.vue';
import GoalComboEditor from './GoalComboEditor.vue';
import { askConfirm } from '../../composables/use-confirm';
import { useRoster } from '../characters/roster';
import {
    GOAL_KINDS,
    METRIC_GROUPS,
    autoTitle,
    groupKeys,
    metricGroup,
    metricApplicable,
    metricUnit,
    type ReadonlyGoal,
    type GoalKind,
    type MetricGroup,
    type GoalItem,
    parseGoalItems,
} from './goals';
import { MONEY_UNITS, type GoalInput } from './goals-store';
import { useDraftGuard } from '../../composables/use-draft-guard';

const props = defineProps<{
    goal?: ReadonlyGoal;
    saving: boolean;
    locked: boolean;
    retrying: boolean;
    error: string;
}>();
const emit = defineEmits<{ save: [input: GoalInput]; close: []; remove: [] }>();
const { roster } = useRoster();
const titleId = useId();
const noteId = useId();
const glass = inject(glassLedger, null);
const kind = ref<GoalKind>(props.goal?.kind ?? 'growth');
const comboItems = ref<GoalItem[]>(
    props.goal?.items?.map((item) => ({ ...item, tracking: { ...item.tracking } })) ?? [],
);
const comboPending = ref(false);
const comboDraft = ref('');
const group = ref<MetricGroup>(
    props.goal?.tracking ? metricGroup(props.goal.tracking) : 'training',
);
const metric = ref(props.goal?.tracking?.key ?? '');
const target = ref(props.goal?.target ?? 0);
const selected = ref(
    props.goal?.members.map((member) => member.id) ?? roster.value.map((character) => character.id),
);
const title = ref(props.goal && props.goal.title !== autoTitle(props.goal) ? props.goal.title : '');
const unitInput = ref(props.goal?.unit ?? '级');
const moneyUnit = ref(props.goal?.unit === '元' ? '元' : '万');
const deadline = ref(props.goal?.deadline ?? '');
const note = ref(props.goal?.note ?? '');
const extraOpen = ref(!!props.goal?.deadline || !!props.goal?.note);
const kindOptions = GOAL_KINDS.map((row) => ({ value: row.value, label: row.label }));
const groupOptions = METRIC_GROUPS.map((row) => ({ value: row.value, label: row.label }));
const memberOptions = computed(() => {
    const live = roster.value.map((character) => ({
        value: character.id,
        label: character.name || '未命名',
    }));
    const gone = (props.goal?.members ?? []).filter(
        (member) => !roster.value.some((character) => character.id === member.id),
    );
    return [
        ...live,
        ...gone.map((member) => ({
            value: member.id,
            label: `${member.name || '未命名'}（已删除）`,
        })),
    ];
});
const members = computed(() =>
    memberOptions.value
        .filter((row) =>
            kind.value === 'combo'
                ? comboItems.value.some((item) => item.characterId === row.value)
                : selected.value.includes(row.value),
        )
        .map((row) => ({
            id: row.value,
            name:
                roster.value.find((character) => character.id === row.value)?.name ||
                props.goal?.members.find((member) => member.id === row.value)?.name ||
                '未命名',
        })),
);
const characters = computed(() =>
    roster.value.filter((character) => selected.value.includes(character.id)),
);
const metricOptions = computed(() => {
    const keys = groupKeys(group.value, characters.value);
    const old = props.goal?.tracking;
    if (old && metricGroup(old) === group.value && !keys.includes(old.key)) keys.push(old.key);
    return keys.map((key) => ({ value: key, label: key }));
});
watch(
    metricOptions,
    (options) => {
        if (!props.locked && !options.some((row) => row.value === metric.value))
            metric.value = options[0]?.value ?? '';
    },
    { immediate: true },
);
const tracking = computed(() =>
    kind.value === 'growth'
        ? {
              category: METRIC_GROUPS.find((row) => row.value === group.value)!.category,
              key: metric.value,
          }
        : null,
);
const unit = computed(() =>
    kind.value === 'combo'
        ? '项'
        : tracking.value
          ? metricUnit(tracking.value)
          : kind.value === 'money'
            ? moneyUnit.value
            : kind.value === 'gear'
              ? '件'
              : unitInput.value.trim(),
);
const incompatible = computed(() =>
    tracking.value
        ? characters.value.filter((character) => !metricApplicable(character, tracking.value!))
        : [],
);
const ready = computed(
    () =>
        members.value.length > 0 &&
        (kind.value === 'combo'
            ? !comboPending.value && !!parseGoalItems(comboItems.value, members.value)
            : Number.isFinite(target.value) && target.value > 0) &&
        !!unit.value &&
        (!tracking.value || (!!metric.value && !incompatible.value.length)),
);
const snapshot = () =>
    JSON.stringify({
        kind: kind.value,
        comboItems: comboItems.value,
        comboDraft: comboDraft.value,
        group: group.value,
        metric: metric.value,
        target: target.value,
        selected: [...selected.value].sort(),
        title: title.value,
        unit: unit.value,
        deadline: deadline.value,
        note: note.value,
    });
const original = snapshot();
const { requestClose } = useDraftGuard(
    () => !props.retrying && snapshot() !== original,
    () => props.saving,
    () => emit('close'),
);

const kindTab = ref(kind.value);
async function pickKindTab(value: string) {
    const option = kindOptions.find((item) => item.value === value);
    if (!option) return;
    kindTab.value = option.value;
    try {
        await pickKind(option.value);
    } finally {
        kindTab.value = kind.value;
    }
}
async function pickKind(next: GoalKind) {
    if (props.locked || props.goal || kind.value === next) return;
    if (kind.value === 'combo' && comboDraft.value) {
        if (
            !(await askConfirm({
                title: '放弃尚未添加的项目？',
                note: '已经添加到列表的项目仍会保留。',
                confirmText: '切换类型',
                danger: true,
            }))
        )
            return;
        comboDraft.value = '';
        comboPending.value = false;
    }
    kind.value = next;
    target.value = 0;
}
function submit() {
    if (props.saving || (!props.retrying && (!ready.value || props.locked))) return;
    emit('save', {
        kind: kind.value,
        title: title.value,
        members: members.value,
        target: kind.value === 'combo' ? 0 : target.value,
        unit: unit.value,
        tracking: tracking.value,
        ...(kind.value === 'combo' ? { items: comboItems.value } : {}),
        deadline: deadline.value,
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
    <ModalShell
        :title="goal ? '修改目标' : '新增目标'"
        :width="kind === 'combo' ? 600 : 480"
        @close="requestClose"
    >
        <form
            class="goal-form modal-form"
            :class="{ 'combo-goal-form': kind === 'combo', 'lg-form-fields': glass }"
            @submit.prevent="submit"
            @keydown.enter="enter"
        >
            <fieldset :disabled="locked" :inert="locked">
                <GlassSegmented
                    v-if="glass"
                    class="goal-kind-tabs"
                    :value="kindTab"
                    aria-label="目标类型"
                    @update:value="pickKindTab"
                >
                    <GlassSegment
                        v-for="option in kindOptions"
                        :key="option.value"
                        :value="option.value"
                        :disabled="locked || (!!goal && option.value !== kind)"
                    >
                        {{ option.label }}
                    </GlassSegment>
                </GlassSegmented>
                <SegmentedPills
                    v-else
                    :disabled="locked"
                    :model-value="kind"
                    :options="
                        kindOptions.map((row) => ({
                            ...row,
                            disabled: !!goal && row.value !== kind,
                        }))
                    "
                    label="目标类型"
                    @update:model-value="pickKind"
                />
                <label class="form-field goal-name" :for="titleId"
                    ><span>{{ kind === 'combo' ? '组合名称' : '目标名称' }}</span
                    ><GlassInput
                        v-if="glass"
                        :id="titleId"
                        v-model="title"
                        :aria-label="kind === 'combo' ? '组合名称' : '目标名称'"
                        placeholder="留空自动生成"
                        autocomplete="off" />
                    <input
                        v-else
                        :id="titleId"
                        v-model="title"
                        class="field"
                        :aria-label="kind === 'combo' ? '组合名称' : '目标名称'"
                        placeholder="留空自动生成"
                        autocomplete="off"
                /></label>
                <GoalComboEditor
                    v-if="kind === 'combo'"
                    v-model="comboItems"
                    :members="members"
                    :disabled="locked"
                    @pending="comboPending = $event"
                    @draft="comboDraft = $event"
                />
                <section v-else class="member-picker">
                    <div class="field-heading">
                        <span
                            >角色 <small>{{ members.length }}</small></span
                        >
                        <PressButton
                            text="全选"
                            label="选择全部角色"
                            size="sm"
                            @click="selected = roster.map((character) => character.id)"
                        />
                    </div>
                    <component
                        :is="glass ? GlassMultiSelect : TogglePills"
                        v-model="selected"
                        :options="memberOptions"
                        label="目标角色（多选）"
                        :disabled="locked"
                    />
                    <p v-if="!memberOptions.length" class="note member-note">
                        暂无角色，请先到角色页新增。
                    </p>
                </section>
                <div v-if="kind === 'growth'" class="pair form-pair">
                    <div class="form-field control">
                        <span>养成分类</span>
                        <component
                            :is="glass ? GlassSelect : SelectField"
                            :hide-label="glass ? true : undefined"
                            :model-value="group"
                            :options="groupOptions"
                            label="养成项目分类"
                            :disabled="locked"
                            @update:model-value="group = $event as MetricGroup"
                        />
                    </div>
                    <div class="form-field control">
                        <span>项目</span>
                        <component
                            :is="glass ? GlassSelect : SelectField"
                            v-model="metric"
                            :hide-label="glass ? true : undefined"
                            :options="metricOptions"
                            label="具体项目"
                            placeholder="选择项目"
                            :disabled="locked"
                        />
                    </div>
                </div>
                <label v-if="kind !== 'combo'" class="target-field">
                    <span>{{ tracking ? '每个角色达到' : '累计目标' }}（{{ unit }}）</span>
                    <component
                        :is="glass ? GlassNumberField : NumberField"
                        v-model="target"
                        label="目标值"
                        class="value-emphasis"
                        update-on-input
                        :precision="kind === 'money' || kind === 'manual' ? 2 : 0"
                        zero-as-empty
                    />
                </label>
                <div v-if="kind === 'money' || kind === 'manual'" class="unit-row">
                    <div v-if="kind === 'money'" class="form-field control">
                        <span>单位</span
                        ><SegmentedPills
                            v-model="moneyUnit"
                            :options="MONEY_UNITS.map((value) => ({ value, label: value }))"
                            :disabled="locked || !!goal?.logs.length"
                            label="金额单位"
                        />
                    </div>
                    <label v-else-if="kind === 'manual'" class="form-field control"
                        ><span>单位</span
                        ><GlassInput
                            v-if="glass"
                            v-model="unitInput"
                            aria-label="目标单位"
                            :disabled="!!goal?.logs.length"
                            maxlength="6" />
                        <input
                            v-else
                            v-model="unitInput"
                            class="field"
                            aria-label="目标单位"
                            :disabled="!!goal?.logs.length"
                            maxlength="6"
                    /></label>
                </div>
                <p v-if="kind === 'growth' && incompatible.length" class="note error" role="alert">
                    {{
                        incompatible.map((character) => character.name || '未命名').join('、')
                    }}不适用此师门技能，请调整角色。
                </p>
                <details
                    :open="extraOpen"
                    @toggle="extraOpen = ($event.target as HTMLDetailsElement).open"
                >
                    <summary>更多设置</summary>
                    <div class="extras">
                        <div class="form-field control">
                            <span v-if="!glass">期限</span>
                            <div class="deadline-row">
                                <component
                                    :is="glass ? GlassDateField : DateField"
                                    v-model="deadline"
                                    label="期望完成日期"
                                    :disabled="locked"
                                />
                                <PressButton
                                    v-if="deadline"
                                    text="不设"
                                    label="清除目标期限"
                                    size="sm"
                                    @click="deadline = ''"
                                />
                            </div>
                        </div>
                        <label class="form-field control" :for="noteId"
                            ><span>备注</span
                            ><GlassInput
                                v-if="glass"
                                :id="noteId"
                                v-model="note"
                                aria-label="目标备注"
                                autocomplete="off" />
                            <input
                                v-else
                                :id="noteId"
                                v-model="note"
                                class="field"
                                aria-label="目标备注"
                                autocomplete="off"
                        /></label>
                    </div>
                </details>
            </fieldset>
        </form>
        <template #footer>
            <FormActions
                :error="error"
                error-role="alert"
                :cancel-disabled="saving"
                :submit-text="saving ? '保存中' : retrying ? '重试保存' : '保存'"
                submit-label="保存目标"
                :submit-disabled="saving || (!retrying && (locked || !ready))"
                @cancel="requestClose"
                @submit="submit"
            >
                <template #before>
                    <p v-if="kind === 'combo'" class="note combo-editor-count">
                        {{ members.length }} 个角色 · {{ comboItems.length }} 项目标<span
                            v-if="comboPending"
                        >
                            · 请先添加或取消当前输入</span
                        >
                    </p>
                </template>
                <PressButton
                    v-if="goal"
                    icon="trash"
                    text="删除"
                    label="删除目标"
                    danger
                    :disabled="locked"
                    @click="emit('remove')"
                />
            </FormActions>
        </template>
    </ModalShell>
</template>

<style scoped>
.goal-kind-tabs {
    width: 100%;
    min-width: 0;
}
.combo-goal-form {
    max-width: none;
}
.goal-name {
    align-self: center;
    width: min(100%, calc(300px * var(--fs-scale)));
    gap: 6px;
    text-align: center;
}
.goal-name > span {
    color: var(--muted);
    font-size: var(--fs-xs);
}
.goal-name > .field {
    width: 100%;
    height: calc(34px * var(--fs-scale));
    text-align: center;
}
.combo-editor-count {
    width: 100%;
    margin: 0;
}
.goal-form fieldset {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
}
.member-picker {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.member-note {
    margin: 0;
}
.member-picker :deep(.pill-group) {
    max-width: 100%;
    flex-wrap: wrap;
}
.member-picker :deep(.bevel-pill) {
    max-width: 100%;
    white-space: normal;
    overflow-wrap: anywhere;
}
.field-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: var(--ink-2);
    font-size: var(--fs-sm);
}
.field-heading small {
    margin-left: 4px;
    color: var(--muted);
}
.control {
    align-items: stretch;
    gap: 6px;
    color: var(--muted);
    font-size: var(--fs-sm);
}
.control :deep(.number-field) {
    width: 100%;
}
.target-field {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
    color: var(--muted);
    font-size: var(--fs-sm);
    text-align: center;
}
.target-field :deep(.glass-number-field) {
    width: min(100%, 180px);
    --number-align: center;
}
.unit-row {
    align-self: center;
    max-width: 100%;
}
.unit-row .control {
    align-items: center;
}
.unit-row .field {
    width: 120px;
    max-width: 100%;
    text-align: center;
}
details {
    border-top: var(--w-hair) solid var(--rule);
    padding-top: 10px;
}
summary {
    width: fit-content;
    cursor: pointer;
    color: var(--muted);
    font-size: var(--fs-sm);
}
.extras {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-top: 12px;
}
.deadline-row {
    display: flex;
    align-items: center;
    gap: 8px;
}
</style>
