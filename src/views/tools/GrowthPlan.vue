<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from 'vue';
import { askConfirm } from '../../composables/use-confirm';
import GroupHead from '../../components/GroupHead.vue';
import LedgerSection from '../../components/LedgerSection.vue';
import LoadNotice from '../../components/LoadNotice.vue';
import NumberField from '../../components/NumberField.vue';
import SelectField from '../../components/SelectField.vue';
import { glassLedger } from '../../components/glass-ledger';
import GlassSelect from '../../components/liquid-glass/GlassSelect.vue';
import PaperCard from '../../components/PaperCard.vue';
import SegmentedPills from '../../components/SegmentedPills.vue';
import PressButton from '../../components/PressButton.vue';
import { ledgerMoneyText } from '../../services/format';
import type { LevelCosts } from '../../services/level-costs';
import { expWanValue } from '../characters/character';
import { loadRoster, useRoster } from '../characters/roster';
import GrowthExtraCard from './GrowthExtraCard.vue';
import { createGrowthExtra, GROWTH_EXTRA_OPTIONS, type GrowthExtra } from './growth-extras';
import {
    createGrowthPlan,
    GROWTH_GROUPS,
    sumGrowthResources,
    summarizeGrowthPlan,
    type GrowthLine,
    type GrowthResources,
} from './growth-plan';

/** 综合预算只保留本页草稿；切换角色重新取档案，不将试算写回账本。 */
const props = defineProps<{ costs: LevelCosts; reloadRoster?: () => Promise<void> }>();
const glass = inject(glassLedger, null);
const selectControl = glass ? GlassSelect : SelectField;
const surface = glass?.card ?? PaperCard;
const surfaceProps = glass ? { radius: 16 } : { plain: true };
const loadingRoster = ref(Boolean(props.reloadRoster));
onMounted(async () => {
    try {
        await props.reloadRoster?.();
    } finally {
        loadingRoster.value = false;
    }
});
const { roster, loadError, pending, writeError } = useRoster();
const roleId = ref('');
const lines = ref<GrowthLine[]>([]);
const ownedExp = ref(0);
const addSkillId = ref('');
const extraKind = ref<string>(GROWTH_EXTRA_OPTIONS[0].value);
const extras = ref<GrowthExtra[]>([]);
let extraSequence = 0;
const character = computed(() => roster.value.find((one) => one.id === roleId.value));
const options = computed(() => roster.value.map((one) => ({ value: one.id, label: one.name })));
const availableSkills = computed(() =>
    props.costs.lifeSkill.skills
        .filter(
            (one) => !lines.value.some((line) => line.kind === 'life' && line.typeId === one.id),
        )
        .map((one) => ({ value: String(one.id), label: one.name })),
);
const summary = computed(() =>
    summarizeGrowthPlan(props.costs, lines.value, ownedExp.value, extras.value),
);
const groups = computed(() => {
    const fixed = GROWTH_GROUPS.map((name) => ({
        key: name,
        name,
        removeKey: '',
        rows: summary.value.rows.filter((row) => row.line.group === name && !row.line.removable),
    })).filter((group) => group.rows.length);
    const added = summary.value.rows
        .filter((row) => row.line.removable)
        .map((row) => ({
            key: row.line.key,
            name: `辅助 · ${row.line.name}`,
            removeKey: row.line.key,
            rows: [row],
        }));
    return [...fixed, ...added].map((group) => ({
        ...group,
        subtotal: detail(sumGrowthResources(group.rows)),
    }));
});
const count = (value: number) => value.toLocaleString('zh-CN');
const amounts = computed(() => {
    const total = summary.value.total;
    return [
        { name: '人物经验', value: count(total.exp) },
        { name: '梦幻币', value: ledgerMoneyText(total.cash) },
        { name: '还需人物经验', value: count(summary.value.remainingExp) },
    ];
});
const RESOURCE_FIELDS: { key: keyof GrowthResources; label: string; max?: boolean }[] = [
    { key: 'exp', label: '人物经验' },
    { key: 'cash', label: '梦幻币' },
    { key: 'cultivationExp', label: '任务修炼经验' },
    { key: 'petCultivationExp', label: '召唤兽修炼经验' },
    { key: 'petExp', label: '召唤兽升级经验' },
    { key: 'material', label: '资材' },
    { key: 'usedBond', label: '消耗帮贡' },
    { key: 'requiredBond', label: '辅助帮贡要求', max: true },
    { key: 'cultivationBond', label: '修炼累计帮贡要求', max: true },
    { key: 'minRoleLevel', label: '修炼人物等级要求', max: true },
    { key: 'moonDew', label: '月华露估算' },
    { key: 'rounds100', label: '100 环估算（轮）' },
    { key: 'fruits', label: '转门派潜能果' },
];
const resourceText = (key: keyof GrowthResources, value: number) =>
    key === 'cash' ? ledgerMoneyText(value) : count(value);
const resources = computed(() => {
    const contributions: { key: string; name: string; values: Partial<GrowthResources> }[] = [
        ...summary.value.rows
            .filter((row) => !row.error && row.line.to > row.line.from)
            .map((row) => ({
                key: row.line.key,
                name: `${row.line.name} ${row.line.from} → ${row.line.to}`,
                values: row.resources,
            })),
        ...summary.value.extraRows
            .filter((row) => !row.error)
            .map((row) => ({
                key: row.item.key,
                name: row.item.name,
                values: { exp: row.exp, cash: row.cash, fruits: row.fruits },
            })),
    ];
    return RESOURCE_FIELDS.filter((field) => summary.value.total[field.key] > 0).map((field) => ({
        ...field,
        value: resourceText(field.key, summary.value.total[field.key]),
        sources: contributions
            .filter((one) => (one.values[field.key] ?? 0) > 0)
            .map((one) => ({
                key: one.key,
                name: one.name,
                value: resourceText(field.key, one.values[field.key] ?? 0),
            })),
    }));
});

// 草稿只在当前计算器实例中保留，切换角色时按角色恢复。
function currentDraft() {
    return { lines: lines.value, extras: extras.value, ownedExp: ownedExp.value };
}
const drafts = new Map<string, { draft: ReturnType<typeof currentDraft>; baseline: string }>();
let baseline = '';

async function requestReset() {
    const id = roleId.value;
    if (JSON.stringify(currentDraft()) !== baseline) {
        const confirmed = await askConfirm({
            title: '重置当前角色的试算？',
            note: '等级和经验将恢复为角色档案值，附加项目将清空。',
            confirmText: '重置',
        });
        if (!confirmed || roleId.value !== id) return;
    }
    reset();
}

function reset() {
    const role = character.value;
    lines.value = role ? createGrowthPlan(props.costs, role) : [];
    const exp = Math.round((role ? (expWanValue(role.experience.value) ?? 0) : 0) * 10_000);
    ownedExp.value = Number.isSafeInteger(exp) ? exp : 0;
    addSkillId.value = '';
    extras.value = [];
    baseline = JSON.stringify(currentDraft());
}

function addSkill() {
    const skill = props.costs.lifeSkill.skills.find((one) => String(one.id) === addSkillId.value);
    if (!skill || lines.value.some((one) => one.kind === 'life' && one.typeId === skill.id)) return;
    lines.value.push({
        key: `life:add:${skill.id}`,
        kind: 'life',
        group: '辅助',
        name: skill.name,
        from: 0,
        to: 0,
        min: 0,
        cap: skill.cap,
        typeId: skill.id,
        recorded: false,
        removable: true,
    });
    addSkillId.value = '';
}

function detail(value: GrowthResources, includeRequirements = false) {
    return RESOURCE_FIELDS.filter(
        (field) => value[field.key] > 0 && (includeRequirements || !field.max),
    )
        .map((field) => `${field.label} ${resourceText(field.key, value[field.key])}`)
        .join(' · ');
}

function addExtra() {
    const option = GROWTH_EXTRA_OPTIONS.find((one) => one.value === extraKind.value);
    if (!character.value || !option) return;
    extras.value.push(
        createGrowthExtra(
            option.value,
            `extra:${++extraSequence}`,
            character.value.level,
        ),
    );
}

function changeExtra(value: GrowthExtra) {
    extras.value = extras.value.map((one) => (one.key === value.key ? value : one));
}

watch(
    () => roster.value.map((one) => one.id),
    (ids) => {
        if (!ids.includes(roleId.value)) roleId.value = ids[0] ?? '';
    },
    { immediate: true },
);
watch(
    () => character.value?.id,
    (id, previous) => {
        if (previous) drafts.set(previous, { draft: currentDraft(), baseline });
        const saved = id && drafts.get(id);
        if (!saved) return reset();
        lines.value = saved.draft.lines;
        extras.value = saved.draft.extras;
        ownedExp.value = saved.draft.ownedExp;
        addSkillId.value = '';
        baseline = saved.baseline;
    },
    { immediate: true },
);
</script>

<template>
    <LoadNotice
        :error="loadError"
        :load="props.reloadRoster ?? loadRoster"
        :blocked="loadingRoster || pending > 0 || !!writeError"
    />
    <p v-if="loadingRoster" class="record-empty" role="status">正在读取角色档案…</p>
    <template v-else-if="!loadError">
        <component :is="surface" v-if="roster.length" v-bind="surfaceProps" class="plan-toolbar lg-form-fields">
            <span class="role-label">计算角色</span>
            <GlassSelect v-if="glass" v-model="roleId" :options="options" label="计算角色" hide-label />
            <SegmentedPills v-else v-model="roleId" :options="options" label="计算角色" wrap />
            <PressButton text="重置" label="恢复所选角色档案的当前等级" @click="requestReset" />
            <span class="muted">仅试算，不修改角色</span>
        </component>
        <p v-else class="record-empty">先在角色页添加角色，即可带入养成数据。</p>
        <div v-if="character" :key="roleId" class="plan-layout growth-layout">
            <LedgerSection
                plain
                class="plan-summary growth-card growth-result-card"
                title="资源合计"
                :hint="`${summary.changed} 项升级 · ${extras.length} 项附加`"
            >
                <label class="plan-owned"
                    ><span>现有经验</span
                    ><NumberField
                        v-model="ownedExp"
                        label="现有人物经验（点）"
                        update-on-input
                    /><span class="muted">点</span></label
                >
                <p v-if="summary.ownedExpError" class="note error" role="alert">
                    {{ summary.ownedExpError }}
                </p>
                <p v-if="summary.errorCount" class="note error" role="alert">
                    请先修正 {{ summary.errorCount }} 项输入，暂不汇总。
                </p>
                <template v-else>
                    <div class="plan-totals growth-amounts">
                        <div
                            v-for="item in amounts"
                            :key="item.name"
                            class="plan-total growth-amount"
                        >
                            <span class="muted">{{ item.name }}</span
                            ><strong class="num">{{ item.value }}</strong>
                        </div>
                    </div>
                    <div v-if="resources.length" class="plan-resources">
                        <details
                            v-for="item in resources"
                            :key="item.key"
                            class="plan-resource"
                            open
                        >
                            <summary>
                                <span>{{ item.label }}</span
                                ><strong class="num"
                                    >{{ item.max ? '最高要求' : '合计' }} {{ item.value }}</strong
                                >
                            </summary>
                            <dl>
                                <template v-for="source in item.sources" :key="source.key"
                                    ><dt>{{ source.name }}</dt>
                                    <dd class="num">
                                        {{ item.max ? '要求' : '需要' }} {{ source.value }}
                                    </dd></template
                                >
                            </dl>
                        </details>
                    </div>
                    <p
                        v-if="
                            summary.total.minRoleLevel >
                            Math.max(
                                character.level,
                                lines.find((one) => one.kind === 'role')?.to ?? 0,
                            )
                        "
                        class="note error"
                    >
                        计划人物等级尚未达到修炼要求。
                    </p>
                    <GroupHead v-if="summary.total.moonDew || summary.total.rounds100"
                        >估算口径</GroupHead
                    >
                    <p v-if="summary.total.moonDew" class="note">
                        月华露为召唤兽升级的替代途径，不与经验重复计价。
                    </p>
                    <p v-if="summary.total.rounds100" class="note">
                        宠修按每项每 100 环 760 经验估算，实际产出随任务变化。
                    </p>
                    <p class="note">未记录项可补填当前值；剧情技能、育兽术暂不计入。</p>
                </template>
            </LedgerSection>
            <div class="plan-groups">
                <LedgerSection
                    v-for="group in groups"
                    :key="group.key"
                    plain
                    class="plan-group growth-card"
                    :title="group.name"
                >
                    <template v-if="group.removeKey" #actions>
                        <PressButton
                            icon="trash"
                            :label="`删除${group.name}计算卡片`"
                            danger
                            @click="lines = lines.filter((one) => one.key !== group.removeKey)"
                        />
                    </template>
                    <div class="plan-column-head muted">
                        <span>项目</span><span>当前</span><span>目标</span>
                    </div>
                    <div v-for="row in group.rows" :key="row.line.key" class="plan-item">
                        <div class="plan-line">
                            <span class="plan-name"
                                >{{ row.line.name
                                }}<small v-if="!row.line.recorded" class="muted"
                                    >未记录</small
                                ></span
                            >
                            <NumberField
                                v-model="row.line.from"
                                :label="`${row.line.name}当前`"
                                update-on-input
                            />
                            <NumberField
                                v-model="row.line.to"
                                :label="`${row.line.name}目标`"
                                update-on-input
                            />
                        </div>
                        <p v-if="row.error" class="note error">{{ row.error }}</p>
                        <p
                            v-else-if="row.line.to > row.line.from"
                            class="plan-detail num"
                            :title="detail(row.resources, true)"
                        >
                            需要：{{ detail(row.resources) }}
                        </p>
                    </div>
                    <p
                        v-if="group.subtotal && !group.rows.some((row) => row.error)"
                        class="plan-subtotal"
                    >
                        <span>小计</span><span class="num">{{ group.subtotal }}</span>
                    </p>
                </LedgerSection>
                <GrowthExtraCard
                    v-for="extra in extras"
                    :key="extra.key"
                    :item="extra"
                    :costs="costs"
                    @update:item="changeExtra"
                    @remove="extras = extras.filter((one) => one.key !== extra.key)"
                />
                <div v-if="availableSkills.length" class="plan-add">
                    <component
                        :is="selectControl"
                        :hide-label="glass ? true : undefined"
                        v-model="addSkillId"
                        :options="availableSkills"
                        label="新增辅助技能计算"
                    />
                    <PressButton
                        icon="add"
                        text="新增"
                        label="新增辅助技能计算项目"
                        :disabled="!addSkillId"
                        @click="addSkill"
                    />
                </div>
                <div class="plan-add">
                    <component
                        :is="selectControl"
                        :hide-label="glass ? true : undefined"
                        v-model="extraKind"
                        :options="GROWTH_EXTRA_OPTIONS"
                        label="新增计算卡片"
                    />
                    <PressButton icon="add" text="新增" label="新增计算卡片" @click="addExtra" />
                </div>
            </div>
        </div>
    </template>
</template>

<style scoped>
.plan-toolbar,
.plan-add {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
}
.plan-add :is(.select-field, .glass-select) {
    width: 168px;
}
.plan-toolbar {
    padding: 10px 14px;
}
.plan-toolbar > .glass-select { width: min(190px, 100%); }
.plan-toolbar > .muted { margin-inline-start: auto; }
.plan-toolbar > .pill-group {
    min-width: 0;
    max-width: 100%;
}
.plan-toolbar .muted {
    font-size: var(--fs-xs);
}
.plan-groups {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 276px), 1fr));
    gap: 12px;
    justify-content: start;
    align-items: start;
    min-width: 0;
}
.plan-add {
    grid-column: 1 / -1;
    margin-bottom: 0;
}
.plan-column-head,
.plan-line {
    display: grid;
    grid-template-columns: minmax(0, 1fr) calc(54px * var(--fs-scale)) calc(54px * var(--fs-scale));
    gap: 6px;
    align-items: center;
}
.plan-column-head {
    padding: 0 0 6px;
    font-size: var(--fs-xs);
    text-align: center;
}
.plan-column-head > :first-child {
    text-align: left;
}
.plan-item + .plan-item {
    border-top: 1px solid var(--rule);
}
.plan-line {
    height: auto;
    min-height: calc(32px * var(--fs-scale));
    padding: 4px 0;
}
.plan-line :deep(.number-field) {
    width: 100%;
    min-width: 0;
    height: calc(24px * var(--fs-scale));
    padding: 2px 6px;
    text-align: center;
    font-size: var(--fs-sm);
}
.plan-name {
    font-size: var(--fs-sm);
    line-height: 1.35;
}
.plan-name small {
    margin-left: 6px;
    font-size: var(--fs-mini);
}
.plan-detail {
    margin: 3px 8px 0;
    font-size: var(--fs-xs);
    overflow-wrap: anywhere;
}
.plan-subtotal {
    display: flex;
    gap: 8px;
    margin: 8px 0 0;
    padding-top: 8px;
    border-top: 1px solid var(--rule-2);
    font-size: var(--fs-xs);
    line-height: 1.5;
}
.plan-subtotal > :first-child {
    flex: none;
    color: var(--muted);
}
.plan-subtotal .num {
    overflow-wrap: anywhere;
}
.plan-total:last-child {
    grid-column: 1 / -1;

}
.plan-owned {
    display: grid;
    grid-template-columns: 1fr minmax(0, 110px) auto;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
}
.plan-owned :deep(.number-field) {
    width: 100%;
    text-align: end;
    min-width: 0;
}
.plan-resources {
    margin: 12px 0;
    font-size: var(--fs-xs);
}
.plan-resource {
    padding: 8px 0;
    border-top: 1px solid var(--rule-2);
}
.plan-resource summary {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    line-height: 1.5;
}
.plan-resource summary::before {
    content: '▸';
    flex: none;
    color: var(--muted);
}
.plan-resource[open] summary::before {
    transform: rotate(90deg);
}
.plan-resource summary > span {
    flex: 1;
    min-width: 0;
}
.plan-resource summary strong {
    font-weight: 500;
    text-align: right;
}
.plan-resource dl {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 5px 10px;
    margin: 8px 0 0;
}
.plan-resource dt {
    color: var(--muted);
    overflow-wrap: anywhere;
}
.plan-resource dd {
    margin: 0;
    text-align: right;
    overflow-wrap: anywhere;
}
</style>
