<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import DateField from '../../components/DateField.vue';
import ModalShell from '../../components/ModalShell.vue';
import NumberField from '../../components/NumberField.vue';
import PressButton from '../../components/PressButton.vue';
import SegmentedPills from '../../components/SegmentedPills.vue';
import SelectField from '../../components/SelectField.vue';
import { useRoster } from '../characters/roster';
import {
    GOAL_KINDS,
    METRIC_CATEGORIES,
    autoTitle,
    goalSummary,
    metricKeys,
    type Goal,
    type GoalKind,
    type GoalMember,
    type MetricCategory,
} from './goals';
import { MONEY_UNITS, snapshotMembers, type GoalInput } from './goals-store';

/**
 * 新建 / 编辑目标。
 *
 * 表单**随类型收放**：选「养成」才出分类与项目；存钱 / 装备只留数值、单位、期限。
 * 摆一堆「对本类型无效」的格子，用户要花时间判断哪几个该填——而判断错了不会报错，
 * 只会得到一个算不出进度的目标。
 *
 * 单位不让人自由填：养成跟项目走（级 / 点）、装备固定「件」、只有存钱要在元与万之间挑。
 * 旧仓让用户自己写单位，写错一次后面每个读数都带着错单位。
 */
const props = defineProps<{ goal?: Goal }>();
const emit = defineEmits<{ save: [input: GoalInput]; close: [] }>();

const { roster } = useRoster();
const titleId = useId();
const noteId = useId();

/** `SelectField` 把空串当「没有值」，所以「全部角色」要一个有值的哨兵。 */
const ALL = '__all__';
/** 编辑时「不动快照」：改标题不该顺手把成员换成今天的名册。 */
const KEEP = '__keep__';

const editing = computed(() => !!props.goal);
const kind = ref<GoalKind>(props.goal?.kind ?? 'growth');
const category = ref<MetricCategory>(props.goal?.tracking?.category ?? 'training');
const metric = ref(props.goal?.tracking?.key ?? '');
const target = ref<number>(props.goal?.target ?? 0);
const moneyUnit = ref(props.goal?.unit === '元' ? '元' : '万');
const deadlineOn = ref(!!props.goal?.deadline);
const deadline = ref(props.goal?.deadline || '');
const who = ref(props.goal ? KEEP : ALL);
/* 存的标题与自动标题一样时**不预填**：让它继续留空，占位字才有「留空即自动」的意思。
 * 预填成一样的字之后，用户改目标值，标题不会跟着变——那正是我们要避免的「两处各写一遍」。 */
const title = ref(props.goal && props.goal.title !== autoTitle(props.goal) ? props.goal.title : '');
const note = ref(props.goal?.note ?? '');
const error = ref('');

const kindOptions = GOAL_KINDS.map((one) => ({ value: one.value, label: one.label }));
const categoryOptions = METRIC_CATEGORIES.map((one) => ({ value: one.value, label: one.label }));
const unitOptions = MONEY_UNITS.map((one) => ({ value: one, label: `按${one}` }));

/** 当前范围的成员。选「全部角色」时是**此刻**的名册，保存那一刻才抄下来。 */
const members = computed<GoalMember[]>(() => {
    if (who.value === KEEP) return props.goal?.members ?? [];
    if (who.value === ALL) return snapshotMembers(roster.value, '');
    return snapshotMembers(roster.value, who.value);
});

const whoOptions = computed(() => {
    const options = roster.value.map((one) => ({ value: one.id, label: one.name || '未命名' }));
    return [
        ...(editing.value && who.value === KEEP
            ? [{ value: KEEP, label: `保持快照（${props.goal?.members.length ?? 0} 个）` }]
            : []),
        { value: ALL, label: `全部角色（${roster.value.length} 个）` },
        ...options,
    ];
});

/** 项目候选按**当前成员**的档案求并集：五个号五个门派时，七项技能会并成十几项。 */
const metricOptions = computed(() => {
    const characters = members.value
        .map((member) => roster.value.find((one) => one.id === member.id))
        .filter((one): one is NonNullable<typeof one> => !!one);
    const keys = metricKeys(category.value, characters);
    /* 编辑时原项目可能已经不在名单里（换过门派、删过技能）。补回去，
     * 否则下拉会静静跳到第一项，用户一保存就把追踪项改成了别的。 */
    const saved = props.goal?.tracking;
    if (saved && saved.category === category.value && !keys.includes(saved.key)) {
        keys.push(saved.key);
    }
    return keys.map((key) => ({ value: key, label: key }));
});

/* 新建时先落到第一个可用项目上：停在下拉占位会让「保存」按钮一直是灰的，
 * 而用户看不出是「项目没选」还是「数没填」。 */
watch(
    metricOptions,
    (options) => {
        if (!options.some((one) => one.value === metric.value)) {
            metric.value = options[0]?.value ?? '';
        }
    },
    { immediate: true },
);

const unit = computed(() => {
    if (kind.value === 'gear') return '件';
    if (kind.value === 'money') return moneyUnit.value;
    return METRIC_CATEGORIES.find((one) => one.value === category.value)?.unit ?? '级';
});

/* 分类一换，项目清单整份换掉：留着旧项目会得到一个「不在这批人档案里」的追踪项，
 * 那种目标在卡片上会显示成一排「待补录」。 */
function pickCategory(next: MetricCategory) {
    category.value = next;
    const options = metricKeys(next, roster.value);
    metric.value = options.includes(metric.value) ? metric.value : (options[0] ?? '');
}

/* 类型一换，目标值多半要重填（25 级与 25 万不是一件事），清零比留着一个错的数诚实。 */
function pickKind(next: GoalKind) {
    if (next === kind.value) return;
    kind.value = next;
    target.value = 0;
    if (next === 'growth' && !metric.value) metric.value = metricOptions.value[0]?.value ?? '';
}

const preview = computed(() => {
    try {
        return autoTitle({
            id: props.goal?.id ?? '',
            kind: kind.value,
            members: members.value,
            target: target.value,
            unit: unit.value,
            tracking:
                kind.value === 'growth' ? { category: category.value, key: metric.value } : null,
            deadline: deadlineOn.value ? deadline.value : '',
            note: note.value,
            logs: props.goal?.logs ?? [],
            createdAt: props.goal?.createdAt ?? 0,
        });
    } catch {
        return '';
    }
});

/** 编辑时把「现在怎么样」写在按钮旁边：改目标值之前，得先看见改完会变成什么样。 */
const progressNow = computed(() => {
    if (!props.goal) return '';
    const summary = goalSummary(props.goal, roster.value);
    if (props.goal.tracking) {
        return `现在 ${summary.achieved} / ${summary.totalMembers} 个角色达标`;
    }
    return `现在 ${summary.current} / ${summary.total} ${props.goal.unit}`;
});

/** 目标值那一格在不同类型下问的不是同一件事，标签跟着换。 */
const targetLabel = computed(() => {
    if (kind.value === 'gear') return '买够几件';
    if (kind.value === 'money') return '攒到';
    return '每个角色到';
});

const ready = computed(() => {
    if (!members.value.length) return false;
    if (!Number.isFinite(target.value) || target.value <= 0) return false;
    if (kind.value === 'growth' && !metric.value) return false;
    if (deadlineOn.value && !deadline.value) return false;
    return true;
});

/**
 * 表单里按回车 = 保存。
 *
 * 只在**文本输入框**上生效：`SelectField` 的纸片里选一项也是回车，那个回车归它自己，
 * 顺手把目标建掉会让人莫名其妙。`PressButton` 是 `type="button"`，本来也不会隐式提交。
 */
function enterSubmit(event: KeyboardEvent) {
    if ((event.target as HTMLElement)?.tagName !== 'INPUT') return;
    submit();
}

function submit() {
    if (!ready.value) {
        error.value = '填完再保存';
        return;
    }
    error.value = '';
    emit('save', {
        kind: kind.value,
        title: title.value,
        members: members.value,
        target: target.value,
        unit: unit.value,
        tracking: kind.value === 'growth' ? { category: category.value, key: metric.value } : null,
        deadline: deadlineOn.value ? deadline.value : '',
        note: note.value,
    });
}
</script>

<template>
    <ModalShell
        :title="editing ? '改这个目标' : '新建目标'"
        :width="480"
        :scroll="false"
        @close="emit('close')"
    >
        <form class="form" @submit.prevent="submit" @keydown.enter.prevent="enterSubmit">
            <div class="form-row pills">
                <span class="field-label">类型</span>
                <SegmentedPills
                    :model-value="kind"
                    :options="kindOptions"
                    label="目标类型"
                    @update:model-value="pickKind"
                />
            </div>

            <template v-if="kind === 'growth'">
                <div class="pair">
                    <div class="form-row">
                        <span class="field-label">分类</span>
                        <SelectField
                            :model-value="category"
                            :options="categoryOptions"
                            label="养成项目分类"
                            @update:model-value="(value) => pickCategory(value as MetricCategory)"
                        />
                    </div>
                    <div class="form-row">
                        <span class="field-label">项目</span>
                        <SelectField
                            v-model="metric"
                            :options="metricOptions"
                            label="具体项目"
                            placeholder="没有可选项"
                        />
                    </div>
                </div>
            </template>

            <div class="pair">
                <div class="form-row">
                    <label class="field-label">{{ targetLabel }}（{{ unit }}）</label>
                    <NumberField
                        v-model="target"
                        label="目标值"
                        :precision="kind === 'money' ? 2 : 0"
                        zero-as-empty
                    />
                </div>
                <div v-if="kind === 'money'" class="form-row">
                    <span class="field-label">单位</span>
                    <SegmentedPills v-model="moneyUnit" :options="unitOptions" label="金额单位" />
                </div>
                <div v-else class="form-row">
                    <span class="field-label">单位</span>
                    <!-- 不画成输入框：它跟着项目走，改不了。画成框会让人去点它。 -->
                    <p class="unit-fixed">{{ unit }}</p>
                </div>
            </div>

            <div class="form-row">
                <span class="field-label">适用角色</span>
                <SelectField v-model="who" :options="whoOptions" label="目标适用哪些角色" />
                <p class="form-note">后续新增角色不加入此目标。</p>
            </div>

            <div class="form-row">
                <span class="field-label">期限</span>
                <div class="deadline-row">
                    <SegmentedPills
                        :model-value="deadlineOn ? 'on' : 'off'"
                        :options="[
                            { value: 'off', label: '不设' },
                            { value: 'on', label: '有期限' },
                        ]"
                        label="是否设期限"
                        radius="sm"
                        @update:model-value="(value) => (deadlineOn = value === 'on')"
                    />
                    <DateField v-if="deadlineOn" v-model="deadline" label="期望完成日期" />
                </div>
            </div>

            <div class="form-row">
                <label class="field-label" :for="titleId">标题</label>
                <input
                    :id="titleId"
                    v-model="title"
                    class="field"
                    type="text"
                    :placeholder="`留空自动：${preview}`"
                    aria-label="目标标题"
                    autocomplete="off"
                />
            </div>

            <div class="form-row">
                <label class="field-label" :for="noteId">备注</label>
                <input
                    :id="noteId"
                    v-model="note"
                    class="field"
                    type="text"
                    placeholder="选填，如：帮派修炼上限没提，只能到 22"
                    aria-label="目标备注"
                    autocomplete="off"
                />
            </div>

            <p class="preview">
                将记为：<b>{{ title.trim() || preview }}</b>
                <span v-if="progressNow" class="preview-now">· {{ progressNow }}</span>
            </p>
            <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        </form>

        <template #footer>
            <PressButton data-modal-cancel text="取消" label="不建了" @click="emit('close')" />
            <PressButton
                icon="check"
                :text="editing ? '保存' : '建这个目标'"
                label="保存目标"
                :disabled="!ready"
                seal
                @click="submit"
            />
        </template>
    </ModalShell>
</template>

<style scoped>
.form {
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.form-row {
    display: flex;
    flex-direction: column;
    /* `align-items: stretch` 必须写：全局 `.form-row` 是「标签在左、控件在右」的一行，
     * 里面写着 `align-items: center`。只改 `flex-direction` 会得到一个「竖排但仍居中」的
     * 表单——标签飘在控件上方中间，宽度收成内容宽（第一版就是这样）。 */
    align-items: stretch;
    gap: 4px;
    min-width: 0;
}
.field-label {
    color: var(--muted);
    font-size: var(--fs-sm);
    letter-spacing: 0.06em;
}
.pair {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 10px;
}
/* 胶囊组是 inline-flex，外层一 stretch 就会把它的承载面拉满整行——
 * 那段底色读起来像「这一行有个空输入框」。 */
.form-row.pills {
    align-items: flex-start;
}
.form-note {
    margin: 0;
    color: var(--muted);
    font-size: var(--fs-xs);
    line-height: 1.6;
    letter-spacing: 0.02em;
}
.unit-fixed {
    display: flex;
    align-items: center;
    height: 28px;
    margin: 0;
    color: var(--muted);
    font-size: var(--fs-sm);
    letter-spacing: 0.04em;
}
.deadline-row {
    display: flex;
    align-items: center;
    gap: 8px;
}
.preview {
    margin: 2px 0 0;
    padding: 8px 10px;
    border-left: 2px solid var(--seal);
    background: color-mix(in srgb, var(--seal) 6%, transparent);
    color: var(--ink-2);
    font-size: var(--fs-sm);
    line-height: 1.6;
    overflow-wrap: anywhere;
}
.preview b {
    font-weight: 400;
    color: var(--ink);
}
.preview-now {
    color: var(--muted);
}
.form-error {
    margin: 0;
    color: var(--danger);
    font-size: var(--fs-sm);
}
</style>
