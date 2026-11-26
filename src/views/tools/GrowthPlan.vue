<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from 'vue';
import { askConfirm } from '../../composables/use-confirm';
import LedgerSection from '../../components/LedgerSection.vue';
import LoadNotice from '../../components/LoadNotice.vue';
import GlassCompactNumberField from '../../components/liquid-glass/GlassCompactNumberField.vue';
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
import {
    createGrowthPlan,
    GROWTH_GROUPS,
    summarizeGrowthPlan,
    type GrowthLine,
    type GrowthResources,
} from './growth-plan';

/** 综合预算只保留本页草稿；切换角色重新取档案，不将试算写回账本。 */
const props = defineProps<{ costs: LevelCosts; reloadRoster?: () => Promise<void> }>();
const glass = inject(glassLedger, null);
const numberControl = glass ? GlassCompactNumberField : NumberField;
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
const character = computed(() => roster.value.find((one) => one.id === roleId.value));
const options = computed(() => roster.value.map((one) => ({ value: one.id, label: one.name })));
const availableSkills = computed(() =>
    props.costs.lifeSkill.skills
        .filter(
            (one) => !lines.value.some((line) => line.kind === 'life' && line.typeId === one.id),
        )
        .map((one) => ({ value: String(one.id), label: one.name })),
);
const summary = computed(() => summarizeGrowthPlan(props.costs, lines.value, ownedExp.value));
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
    return [...fixed, ...added];
});
const count = (value: number) => value.toLocaleString('zh-CN');
const RESOURCE_FIELDS: {
    key: keyof GrowthResources;
    label: string;
    max?: boolean;
    estimate?: boolean;
}[] = [
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
    { key: 'moonDew', label: '月华露估算', estimate: true },
    { key: 'rounds100', label: '100 环估算（轮）', estimate: true },
];
const resourceText = (key: keyof GrowthResources, value: number) =>
    key === 'cash' ? ledgerMoneyText(value) : count(value);
const resources = computed(() => {
    const contributions = summary.value.rows
        .filter((row) => !row.error && row.line.to > row.line.from)
        .map(({ line, resources }) => ({
            key: line.key,
            name: `${line.name} ${line.from} → ${line.to}`,
            values: resources,
        }));
    return RESOURCE_FIELDS.filter((field) => summary.value.total[field.key] > 0).map((field) => ({
        ...field,
        value: resourceText(field.key, summary.value.total[field.key]),
        sources: contributions
            .filter((one) => one.values[field.key] > 0)
            .map((one) => ({
                key: one.key,
                name: one.name,
                value: resourceText(field.key, one.values[field.key]),
            })),
    }));
});

const costsInPlan = computed(() => resources.value.filter((item) => !item.max && !item.estimate));

// 草稿只在当前计算器实例中保留，切换角色时按角色恢复。
function currentDraft() {
    return { lines: lines.value, ownedExp: ownedExp.value };
}
const drafts = new Map<string, { draft: ReturnType<typeof currentDraft>; baseline: string }>();
let baseline = '';

async function requestReset() {
    const id = roleId.value;
    if (JSON.stringify(currentDraft()) !== baseline) {
        const confirmed = await askConfirm({
            title: '重置当前角色的试算？',
            note: '等级和经验将恢复为角色档案值，新增的辅助技能将移除。',
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
        <component
            :is="surface"
            v-if="roster.length"
            v-bind="surfaceProps"
            class="plan-toolbar lg-form-fields"
        >
            <span class="role-label">计算角色</span>
            <GlassSelect
                v-if="glass"
                v-model="roleId"
                :options="options"
                label="计算角色"
                hide-label
            />
            <SegmentedPills v-else v-model="roleId" :options="options" label="计算角色" wrap />
            <label class="plan-owned">
                <span>现有经验（点）</span>
                <component
                    :is="numberControl"
                    v-model="ownedExp"
                    label="现有人物经验（点）"
                    v-bind="glass ? { wide: true } : {}"
                    update-on-input
                />
            </label>
            <PressButton text="重置" label="恢复所选角色档案的当前等级" @click="requestReset" />
            <span class="muted">仅试算，不修改角色</span>
            <p
                v-if="character && summary.ownedExpError"
                class="plan-exp-error note error"
                role="alert"
            >
                {{ summary.ownedExpError }}
            </p>
        </component>
        <p v-if="!roster.length" class="record-empty">先在角色页添加角色，即可带入养成数据。</p>
        <div v-if="character" :key="roleId" class="plan-layout growth-layout">
            <LedgerSection plain class="plan-summary growth-card growth-result-card" title="总消耗">
                <p v-if="summary.errorCount" class="note error" role="alert">
                    请先修正 {{ summary.errorCount }} 项输入，暂不汇总。
                </p>
                <p v-else-if="!resources.length" class="note">暂无消耗</p>
                <template v-else>
                    <div class="growth-amounts plan-totals">
                        <div v-for="item in costsInPlan" :key="item.key" class="growth-amount">
                            <span class="muted">{{ item.label }}</span>
                            <strong class="num">{{ item.value }}</strong>
                            <small v-if="item.key === 'exp' && ownedExp > 0" class="muted">
                                还需 {{ count(summary.remainingExp) }} 点
                            </small>
                        </div>
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
                    <details class="plan-breakdown">
                        <summary>消耗明细</summary>
                        <div class="plan-breakdown-grid">
                            <component
                                :is="surface"
                                v-for="item in resources"
                                :key="item.key"
                                v-bind="surfaceProps"
                                class="plan-resource"
                            >
                                <h3>
                                    <span>{{ item.label }}</span>
                                    <span class="num"
                                        >{{ item.max ? '最高要求 ' : '' }}{{ item.value }}</span
                                    >
                                </h3>
                                <dl v-if="item.sources.length">
                                    <template v-for="source in item.sources" :key="source.key">
                                        <dt>{{ source.name }}</dt>
                                        <dd class="num">{{ source.value }}</dd>
                                    </template>
                                </dl>
                            </component>
                        </div>
                        <p v-if="summary.total.moonDew" class="note">
                            月华露为召唤兽升级的替代途径。
                        </p>
                        <p v-if="summary.total.rounds100" class="note">
                            宠修按每项每 100 环 760 经验估算。
                        </p>
                        <p class="note">剧情技能、育兽术暂不计入。</p>
                    </details>
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
                            <component
                                :is="numberControl"
                                v-model="row.line.from"
                                :label="`${row.line.name}当前`"
                                update-on-input
                            />
                            <component
                                :is="numberControl"
                                v-model="row.line.to"
                                :label="`${row.line.name}目标`"
                                update-on-input
                            />
                        </div>
                        <p v-if="row.error" class="note error">{{ row.error }}</p>
                    </div>
                </LedgerSection>
                <div v-if="availableSkills.length" class="plan-add">
                    <component
                        :is="selectControl"
                        v-model="addSkillId"
                        :hide-label="glass ? true : undefined"
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
.plan-toolbar > .glass-select {
    width: min(190px, 100%);
}
.plan-toolbar > .muted {
    margin-inline-start: auto;
}
.plan-toolbar > .pill-group {
    min-width: 0;
    max-width: 100%;
}
.plan-toolbar .muted {
    font-size: var(--fs-xs);
}
.plan-exp-error {
    flex-basis: 100%;
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
.plan-line :deep(.field.number-field) {
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
.plan-owned {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    max-width: 100%;
    font-size: var(--fs-sm);
}
.plan-owned > .field {
    width: 110px;
    min-width: 0;
}
.plan-breakdown {
    margin-top: 8px;
    font-size: var(--fs-sm);
}
.plan-breakdown > summary {
    width: fit-content;
    padding-block: 5px;
    cursor: pointer;
}
.plan-breakdown-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 208px), 1fr));
    align-items: start;
    gap: 8px;
    margin-top: 4px;
}
.plan-resource {
    min-width: 0;
    padding: 8px 10px;
}
.plan-resource h3 {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: baseline;
    gap: 2px 8px;
    margin: 0;
    font-size: var(--fs-sm);
    font-weight: 400;
    overflow-wrap: anywhere;
}
.plan-resource dl {
    display: grid;
    grid-template-columns: minmax(0, 1fr) fit-content(52%);
    gap: 3px 8px;
    margin: 5px 0 0;
    font-size: var(--fs-xs);
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
