<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import DateField from '../../components/DateField.vue';
import ModalShell from '../../components/ModalShell.vue';
import NumberField from '../../components/NumberField.vue';
import PressButton from '../../components/PressButton.vue';
import SegmentedPills from '../../components/SegmentedPills.vue';
import SelectField from '../../components/SelectField.vue';
import TogglePills from '../../components/TogglePills.vue';
import { useRoster } from '../characters/roster';
import {
    GOAL_KINDS,
    METRIC_GROUPS,
    autoTitle,
    groupKeys,
    metricGroup,
    metricApplicable,
    metricUnit,
    type Goal,
    type GoalKind,
    type MetricGroup,
} from './goals';
import { MONEY_UNITS, type GoalInput } from './goals-store';

const props = defineProps<{
    goal?: Goal;
    saving: boolean;
    locked: boolean;
    retrying: boolean;
    error: string;
}>();
const emit = defineEmits<{ save: [input: GoalInput]; close: [] }>();
const { roster } = useRoster();
const titleId = useId();
const noteId = useId();
const kind = ref<GoalKind>(props.goal?.kind ?? 'growth');
const group = ref<MetricGroup>(
    props.goal?.tracking ? metricGroup(props.goal.tracking) : 'training',
);
const metric = ref(props.goal?.tracking?.key ?? '');
const target = ref(props.goal?.target ?? 0);
const selected = ref(
    props.goal?.members.map((member) => member.id) ?? roster.value.map((character) => character.id),
);
const title = ref(
    props.goal && (props.goal.kind === 'manual' || props.goal.title !== autoTitle(props.goal))
        ? props.goal.title
        : '',
);
const unitInput = ref(props.goal?.unit ?? '级');
const moneyUnit = ref(props.goal?.unit === '元' ? '元' : '万');
const deadline = ref(props.goal?.deadline ?? '');
const note = ref(props.goal?.note ?? '');
const extraOpen = ref(
    !!props.goal?.deadline ||
        !!props.goal?.note ||
        (props.goal?.kind !== 'manual' && !!title.value),
);
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
        .filter((row) => selected.value.includes(row.value))
        .map((row) => {
            const live = roster.value.find((character) => character.id === row.value);
            return {
                id: row.value,
                name:
                    live?.name ||
                    props.goal?.members.find((member) => member.id === row.value)?.name ||
                    '未命名',
            };
        }),
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
    tracking.value
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
        Number.isFinite(target.value) &&
        target.value > 0 &&
        !!unit.value &&
        (!tracking.value || (!!metric.value && !incompatible.value.length)) &&
        (kind.value !== 'manual' || !!title.value.trim()),
);
function pickKind(next: GoalKind) {
    if (props.locked || props.goal || kind.value === next) return;
    kind.value = next;
    target.value = 0;
}
function submit() {
    if (props.saving || (!props.retrying && (!ready.value || props.locked))) return;
    emit('save', {
        kind: kind.value,
        title: title.value,
        members: members.value,
        target: target.value,
        unit: unit.value,
        tracking: tracking.value,
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
        :width="480"
        @close="!saving && emit('close')"
    >
        <form class="goal-form modal-form" @submit.prevent="submit" @keydown.enter="enter">
            <fieldset :disabled="locked" :inert="locked">
                <SegmentedPills
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
                <section class="member-picker">
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
                    <TogglePills
                        v-model="selected"
                        :options="memberOptions"
                        label="目标角色（多选）"
                        :disabled="locked"
                    />
                    <p v-if="!memberOptions.length" class="note">暂无角色，请先到角色页新增。</p>
                </section>
                <div v-if="kind === 'growth'" class="pair">
                    <label class="control"
                        ><span>养成分类</span
                        ><SelectField
                            :model-value="group"
                            :options="groupOptions"
                            label="养成项目分类"
                            :disabled="locked"
                            @update:model-value="group = $event as MetricGroup"
                    /></label>
                    <label class="control"
                        ><span>项目</span
                        ><SelectField
                            v-model="metric"
                            :options="metricOptions"
                            label="具体项目"
                            placeholder="选择项目"
                            :disabled="locked"
                    /></label>
                </div>
                <label v-if="kind === 'manual'" class="control" :for="titleId">
                    <span>目标名称</span
                    ><input
                        :id="titleId"
                        v-model="title"
                        class="field"
                        aria-label="目标标题"
                        placeholder="坐骑成长、法宝修炼等"
                        autocomplete="off"
                    />
                </label>
                <label class="target-field">
                    <span>{{ tracking ? '每个角色达到' : '累计目标' }}（{{ unit }}）</span>
                    <NumberField
                        v-model="target"
                        label="目标值"
                        update-on-input
                        :precision="kind === 'money' || kind === 'manual' ? 2 : 0"
                        zero-as-empty
                    />
                </label>
                <div v-if="kind === 'money' || kind === 'manual'" class="unit-row">
                    <div v-if="kind === 'money'" class="control">
                        <span>单位</span
                        ><SegmentedPills
                            v-model="moneyUnit"
                            :options="MONEY_UNITS.map((value) => ({ value, label: value }))"
                            :disabled="locked || !!goal?.logs.length"
                            label="金额单位"
                        />
                    </div>
                    <label v-else-if="kind === 'manual'" class="control"
                        ><span>单位</span
                        ><input
                            v-model="unitInput"
                            class="field"
                            aria-label="目标单位"
                            :disabled="!!goal?.logs.length"
                            maxlength="6"
                    /></label>
                </div>
                <p v-if="incompatible.length" class="note error" role="alert">
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
                        <label v-if="kind !== 'manual'" class="control" :for="titleId"
                            ><span>标题</span
                            ><input
                                :id="titleId"
                                v-model="title"
                                class="field"
                                aria-label="目标标题"
                                placeholder="留空自动生成"
                                autocomplete="off"
                        /></label>
                        <div class="control">
                            <span>期限</span>
                            <div class="deadline-row">
                                <DateField
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
                        <label class="control" :for="noteId"
                            ><span>备注</span
                            ><input
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
            <p v-if="error" class="note error save-error" role="alert">{{ error }}</p>
            <PressButton
                data-modal-cancel
                text="取消"
                label="取消"
                :disabled="saving"
                @click="emit('close')"
            />
            <PressButton
                icon="check"
                :text="saving ? '保存中' : retrying ? '重试保存' : '保存'"
                label="保存目标"
                :disabled="saving || (!retrying && !ready)"
                seal
                @click="submit"
            />
        </template>
    </ModalShell>
</template>

<style scoped>
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
.pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
}
.control {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
    min-width: 0;
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
.target-field :deep(.number-field) {
    width: min(100%, calc(156px * var(--fs-scale)));
    height: auto;
    padding: 8px 16px 10px;
    border-radius: var(--r-3);
    color: var(--num);
    font-size: calc(var(--fs-base) * 1.8);
    font-variant-numeric: tabular-nums;
    line-height: 1.25;
    text-align: center;
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
.note {
    margin: 0;
}
.deadline-row {
    display: flex;
    align-items: center;
    gap: 8px;
}
</style>
