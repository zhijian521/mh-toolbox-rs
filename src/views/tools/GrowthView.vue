<script setup lang="ts">
import { computed, defineAsyncComponent, inject, onMounted, reactive, ref, watch } from 'vue';
import LedgerSection from '../../components/LedgerSection.vue';
import LoadNotice from '../../components/LoadNotice.vue';
import GlassCompactNumberField from '../../components/liquid-glass/GlassCompactNumberField.vue';
import NumberField from '../../components/NumberField.vue';
import ToolPageShell from './ToolPageShell.vue';
import GlassSelect from '../../components/liquid-glass/GlassSelect.vue';
import SelectField from '../../components/SelectField.vue';
import SegmentedPills from '../../components/SegmentedPills.vue';
import { glassLedger } from '../../components/glass-ledger';
import { GlassSegment, GlassSegmented } from '../../components/liquid-glass';
import PaperCard from '../../components/PaperCard.vue';
import { ledgerMoneyText } from '../../services/format';
import {
    cultivationCost,
    expToGrade,
    levelCosts,
    levelCostsError,
    lifeSkillCost,
    lifeSkillOf,
    loadLevelCosts,
    MENPAI_FLY_MIN_LEVEL,
    menpaiCost,
    petCultivationCost,
    petLevelCost,
    qianNengGuoCost,
    qianYuanDanCost,
    roleExpBetween,
    schoolSkillCost,
} from '../../services/level-costs';

defineProps<{ reloadRoster?: () => Promise<void> }>();

/** 单项计算保留各自输入；综合预算读取角色草稿，共用官网代价表。 */
const GrowthPlan = defineAsyncComponent(() => import('./GrowthPlan.vue'));
const mode = ref<'single' | 'plan'>('single');
const openedPlan = ref(false);
watch(
    mode,
    () => {
        openedPlan.value = true;
    },
    { once: true },
);
const glass = inject(glassLedger, null);
const numberControl = glass ? GlassCompactNumberField : NumberField;
const selectControl = glass ? GlassSelect : SelectField;
const surface = glass?.card ?? PaperCard;
const surfaceProps = glass ? { radius: 16 } : { plain: true };
const MODES = [
    { value: 'single' as const, label: '单项计算' },
    { value: 'plan' as const, label: '综合计算' },
];

onMounted(() => {
    void loadLevelCosts();
});

/* `LoadNotice` 要的是「重试这一下」本身，返回值由服务层自己收着，所以这里把返回值吃掉。 */
const reload = async () => {
    await loadLevelCosts();
};

/* 读数与「哪些格子没填好」都从这一处出：`costs` 为空时整页只剩提示条。 */
const costs = computed(() => levelCosts.value);

/** 千分位整数。经验动辄十亿，不分位读不出量级。 */
const count = (value: number) => value.toLocaleString('zh-CN');

type CalcKey =
    | 'role'
    | 'expGrade'
    | 'schoolSkill'
    | 'lifeSkill'
    | 'cultivation'
    | 'petCultivation'
    | 'petLevel'
    | 'qianYuanDan'
    | 'qianNengGuo'
    | 'menpai';

interface CalcType {
    key: CalcKey;
    /** 卡片上那行小字：这一项算的是什么。 */
    tag: string;
    name: string;
    /** 输入卡头右侧的范围提示。 */
    inputHint: string;
    /** 读数卡头右侧的口径提示。 */
    resultHint: string;
}

/**
 * 单项计算目录，顺序即键盘切换顺序。
 */
const TYPES: CalcType[] = [
    {
        key: 'role',
        tag: '人物',
        name: '等级经验',
        inputHint: '0 到 175 级',
        resultHint: '从当前升到目标',
    },
    {
        key: 'expGrade',
        tag: '人物',
        name: '经验换算等级',
        inputHint: '当前等级 + 手上经验',
        resultHint: '逐级扣减后的落点',
    },
    {
        key: 'schoolSkill',
        tag: '技能',
        name: '师门技能',
        inputHint: '单项 0 到 180 级',
        resultHint: '经验与梦幻币',
    },
    {
        key: 'lifeSkill',
        tag: '技能',
        name: '辅助技能',
        inputHint: '21 项，上限各自不同',
        resultHint: '含帮贡消耗',
    },
    {
        key: 'cultivation',
        tag: '修炼',
        name: '人物修炼',
        inputHint: '攻击等四类 25、猎术 20',
        resultHint: '帮贡与等级取目标级',
    },
    {
        key: 'petCultivation',
        tag: '修炼',
        name: '召唤兽修炼',
        inputHint: '0 到 25 级',
        resultHint: '按 100 环估算',
    },
    {
        key: 'petLevel',
        tag: '召唤兽',
        name: '召唤兽升级',
        inputHint: '1 到 180 级',
        resultHint: '含月华露用量',
    },
    {
        key: 'qianYuanDan',
        tag: '人物',
        name: '乾元丹',
        inputHint: '最多 9 颗',
        resultHint: '单颗代价累加',
    },
    {
        key: 'qianNengGuo',
        tag: '人物',
        name: '潜能果兑换',
        inputHint: '最多 200 颗',
        resultHint: '只算新增那几颗',
    },
    {
        key: 'menpai',
        tag: '人物',
        name: '转门派',
        inputHint: '60 到 175 级',
        resultHint: '经验封顶 10 亿',
    },
];

/** 每张卡的格子叫什么。空串表示这一格不显示；`c` 只在少数几项出现。 */
const FIELD_LABELS: Record<CalcKey, { a: string; b: string; c: string }> = {
    role: { a: '当前等级', b: '目标等级', c: '' },
    expGrade: { a: '当前等级', b: '手上经验', c: '' },
    schoolSkill: { a: '当前等级', b: '目标等级', c: '' },
    lifeSkill: { a: '当前等级', b: '目标等级', c: '' },
    cultivation: { a: '当前等级', b: '目标等级', c: '' },
    petCultivation: { a: '当前等级', b: '目标等级', c: '' },
    petLevel: { a: '当前等级', b: '目标等级', c: '' },
    qianYuanDan: { a: '已有颗数', b: '目标颗数', c: '' },
    qianNengGuo: { a: '已有颗数', b: '目标颗数', c: '' },
    /* 未飞升只填前两格；已飞升多一格「已吃潜能果」。 */
    menpai: { a: '人物等级', b: '人物总经验', c: '已吃潜能果' },
};

/**
 * 各项目的输入各自存一份：换卡再换回来，刚才填的数还在。
 * `pick` 是「这一项里选哪一个」：辅助技能、修炼类型、转门派是否飞升。
 */
const form = reactive<Record<CalcKey, { a: number; b: number; c: number; pick: string }>>({
    role: { a: 0, b: 175, c: 0, pick: '' },
    expGrade: { a: 100, b: 100000, c: 0, pick: '' },
    schoolSkill: { a: 0, b: 180, c: 0, pick: '' },
    /* 默认强身术：上限 140，是 21 项里最常点的一项。 */
    lifeSkill: { a: 0, b: 140, c: 0, pick: '201' },
    cultivation: { a: 0, b: 25, c: 0, pick: '1' },
    petCultivation: { a: 0, b: 25, c: 0, pick: '' },
    petLevel: { a: 1, b: 180, c: 0, pick: '' },
    qianYuanDan: { a: 0, b: 9, c: 0, pick: '' },
    qianNengGuo: { a: 0, b: 50, c: 0, pick: '' },
    menpai: { a: 129, b: 0, c: 0, pick: 'nofly' },
});

const active = ref<CalcKey>('role');
const activeType = computed(() => TYPES.find((one) => one.key === active.value) ?? TYPES[0]);
const current = computed(() => form[active.value]);
const labels = computed(() => FIELD_LABELS[active.value]);
const secondFieldProps = computed(() => {
    if (!glass) return {};
    return { wide: active.value === 'expGrade' || active.value === 'menpai' };
});

const categories = [...new Set(TYPES.map((item) => item.tag))].map((tag) => ({
    value: tag,
    label: tag,
}));
const category = computed({
    get: () => activeType.value.tag,
    set: (tag: string) => {
        const first = TYPES.find((item) => item.tag === tag);
        if (first) active.value = first.key;
    },
});
const projects = computed(() =>
    TYPES.filter((item) => item.tag === category.value).map((item) => ({
        value: item.key,
        label: item.name,
    })),
);

function pickProject(key: string) {
    const project = projects.value.find((item) => item.value === key);
    if (project) active.value = project.value;
}

const lifeOptions = computed(() =>
    (costs.value?.lifeSkill.skills ?? []).map((one) => ({
        value: String(one.id),
        label: `${one.name}（${one.cap}）`,
    })),
);
const cultOptions = computed(() =>
    (costs.value?.cultivation.types ?? []).map((one) => ({
        value: String(one.id),
        label: one.name,
    })),
);

const MENPAI_OPTIONS = [
    { value: 'nofly', label: '未飞升' },
    { value: 'fly', label: '已飞升' },
];

const pickField = computed(() => {
    switch (active.value) {
        case 'lifeSkill': return { label: '辅助技能', options: lifeOptions.value };
        case 'cultivation': return { label: '修炼类型', options: cultOptions.value };
        case 'menpai': return { label: '飞升阶段', options: MENPAI_OPTIONS };
        default: return null;
    }
});

/**
 * 换技能 / 换修炼类型时把目标等级收进新上限。
 *
 * 不这么做就得让用户在「必填」和「超上限」之间自己发现矛盾：21 项辅助技能的上限
 * 从 20 到 160 不等，默认的 140 落到风之感应上就是一个必然报错的输入。
 */
watch(
    () => current.value.pick,
    () => {
        const table = costs.value;
        if (!table) return;
        if (active.value === 'menpai' && current.value.pick === 'fly') {
            current.value.a = Math.max(current.value.a, MENPAI_FLY_MIN_LEVEL);
        }
        const cap =
            active.value === 'lifeSkill'
                ? (lifeSkillOf(table, Number(current.value.pick))?.cap ?? 0)
                : active.value === 'cultivation'
                  ? (table.cultivation.types.find((one) => one.id === Number(current.value.pick))
                        ?.cap ?? 0)
                  : 0;
        if (cap && current.value.b > cap) current.value.b = cap;
    },
);

/** 两个等级是否构成一个官网接受的区间；不构成时给出**这句话**。 */
function rangeNote(from: number, to: number, min: number, cap: number): string {
    if (![from, to].every(Number.isSafeInteger)) return '等级需为有效整数';
    if (from < min || from > cap) return '起始等级需在 ' + min + ' 到 ' + cap + ' 之间';
    if (to < min || to > cap) return '目标等级需在 ' + min + ' 到 ' + cap + ' 之间';
    if (from >= to) return '目标等级要比起始等级高';
    return '';
}

interface Reading {
    cap: string;
    value: string;
}

interface Outcome {
    /** 区间不成立时的说明；非空时读数整块空着，只显示这句。 */
    note: string;
    /** 这一项的答案：经验、梦幻币这类主数字，大字摆在读数卡上半。 */
    headline: Reading[];
    /** 附带条件：等级要求、帮贡、轮次这类小字。 */
    details: Reading[];
}

const NONE: Outcome = { note: '', headline: [], details: [] };

/**
 * 各项读数共用一个出口：页面只认识「主数字 + 附带条件」两栏，
 * 不认识「修炼」与「乾元丹」的区别——那些口径住在 `level-costs.ts` 里。
 */
const outcome = computed<Outcome>(() => {
    const table = costs.value;
    if (!table) return NONE;
    const input = current.value;
    const values = [
        input.a,
        ...(labels.value.b ? [input.b] : []),
        ...(active.value === 'menpai' && input.pick === 'fly' ? [input.c] : []),
    ];
    if (
        values.some(
            (value) => !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER,
        )
    ) {
        return { ...NONE, note: '请输入有效的非负数值' };
    }

    switch (active.value) {
        case 'role': {
            const note = rangeNote(input.a, input.b, 0, table.role.cap);
            if (note) return { ...NONE, note };
            return {
                note: '',
                headline: [
                    { cap: '需要经验', value: count(roleExpBetween(table, input.a, input.b)) },
                ],
                details: [],
            };
        }
        case 'expGrade': {
            if (input.a < 1 || input.a > table.role.cap) {
                return { ...NONE, note: `当前等级需在 1 到 ${table.role.cap} 之间` };
            }
            const result = expToGrade(table, input.a, input.b);
            return {
                note: '',
                headline: [{ cap: '剩余经验', value: count(result.left) }],
                details: [{ cap: '可达等级', value: String(result.grade) }],
            };
        }
        case 'schoolSkill': {
            const note = rangeNote(input.a, input.b, 0, table.schoolSkill.cap);
            if (note) return { ...NONE, note };
            const result = schoolSkillCost(table, input.a, input.b);
            return {
                note: '',
                headline: [
                    { cap: '需要经验', value: count(result.exp) },
                    { cap: '需要梦幻币', value: ledgerMoneyText(result.cash) },
                ],
                details: [],
            };
        }
        case 'lifeSkill': {
            const skill = lifeSkillOf(table, Number(input.pick));
            if (!skill) return { ...NONE, note: '请选择一项辅助技能' };
            const note = rangeNote(input.a, input.b, 0, skill.cap);
            if (note) return { ...NONE, note };
            const result = lifeSkillCost(table, skill.id, input.a, input.b);
            if (!result) return { ...NONE, note: `目标等级需在 0 到 ${skill.cap} 之间` };
            return {
                note: '',
                headline: [
                    { cap: '需要经验', value: count(result.exp) },
                    { cap: '需要梦幻币', value: ledgerMoneyText(result.cash) },
                ],
                /* 帮贡两列都由等级推出：需要 = 5×目标等级，消耗 = 区间三角数之差。 */
                details: [
                    { cap: '需要帮贡', value: count(result.reqBond) },
                    { cap: '消耗帮贡', value: count(result.usedBond) },
                ],
            };
        }
        case 'cultivation': {
            const type = table.cultivation.types.find((one) => one.id === Number(input.pick));
            if (!type) return { ...NONE, note: '请选择一类修炼' };
            const note = rangeNote(input.a, input.b, 0, type.cap);
            if (note) return { ...NONE, note };
            const result = cultivationCost(table, type.id, input.a, input.b);
            if (!result) return { ...NONE, note: `目标等级需在 0 到 ${type.cap} 之间` };
            return {
                note: '',
                headline: [
                    { cap: '需要修炼经验', value: count(result.exp) },
                    { cap: '需要梦幻币', value: ledgerMoneyText(result.cash) },
                ],
                /* 帮贡与人物等级要求取目标等级那一级，不随区间增长。 */
                details: [
                    { cap: '需要资材', value: count(result.material) },
                    { cap: '需要帮贡', value: count(result.bond) },
                    { cap: '人物等级要求', value: String(result.minRoleLevel) },
                ],
            };
        }
        case 'petCultivation': {
            const note = rangeNote(input.a, input.b, 0, 25);
            if (note) return { ...NONE, note };
            const result = petCultivationCost(table, input.a, input.b);
            return {
                note: '',
                headline: [{ cap: '需要修炼经验', value: count(result.exp) }],
                details: [
                    { cap: '人物等级要求', value: String(result.minRoleLevel) },
                    { cap: '100 环数量', value: result.rounds100 + ' 轮' },
                ],
            };
        }
        case 'petLevel': {
            const note = rangeNote(input.a, input.b, 1, table.petLevel.cap);
            if (note) return { ...NONE, note };
            const result = petLevelCost(table, input.a, input.b);
            return {
                note: '',
                headline: [{ cap: '需要经验', value: count(result.exp) }],
                details: [{ cap: '需要月华露', value: count(result.moonDew) + ' 个' }],
            };
        }
        case 'qianYuanDan': {
            if (input.a < 0 || input.a > table.qianYuanDan.cap) {
                return { ...NONE, note: `已有颗数需在 0 到 ${table.qianYuanDan.cap} 之间` };
            }
            if (input.b < input.a || input.b > table.qianYuanDan.cap) {
                return {
                    ...NONE,
                    note: `目标颗数需在 ${input.a} 到 ${table.qianYuanDan.cap} 之间`,
                };
            }
            const result = qianYuanDanCost(table, input.a, input.b);
            if (!result) return { ...NONE, note: '颗数超出范围' };
            return {
                note: '',
                headline: [
                    { cap: '需要经验', value: count(result.exp) },
                    { cap: '需要梦幻币', value: ledgerMoneyText(result.cash) },
                ],
                details: [],
            };
        }
        case 'qianNengGuo': {
            const cap = table.qianNengGuo.cap;
            if (input.a < 0 || input.a > cap) {
                return { ...NONE, note: `已有颗数需在 0 到 ${cap} 之间` };
            }
            if (input.b < input.a || input.b > cap) {
                return { ...NONE, note: `目标颗数需在 ${input.a} 到 ${cap} 之间` };
            }
            const result = qianNengGuoCost(table, input.a, input.b);
            if (!result) return { ...NONE, note: '颗数超出范围' };
            return {
                note: '',
                headline: [{ cap: '需要经验', value: count(result.exp) }],
                /* 只算新增那几颗：0→200 与 150→200 的差价，取决于从第几颗开始吃。 */
                details: [{ cap: '新增颗数', value: count(result.fruits) + ' 颗' }],
            };
        }
        case 'menpai': {
            const fly = input.pick === 'fly';
            const floor = fly ? MENPAI_FLY_MIN_LEVEL : table.menpai.min;
            if (input.a < floor || input.a > table.menpai.max) {
                return { ...NONE, note: `人物等级需在 ${floor} 到 ${table.menpai.max} 之间` };
            }
            if (fly && (input.c < 0 || input.c > table.qianNengGuo.cap)) {
                return { ...NONE, note: `已吃潜能果需在 0 到 ${table.qianNengGuo.cap} 之间` };
            }
            const result = menpaiCost(table, input.a, input.b, fly ? input.c : null);
            if (!result) return { ...NONE, note: '等级超出可转范围' };
            const details: Reading[] = [];
            if (result.capped) {
                details.push({ cap: '已按上限计', value: '10 亿' });
            }
            if (result.fruit !== null) {
                details.push({ cap: '需扣除潜能果', value: count(result.fruit) + ' 颗' });
                if (result.fruitShort) {
                    details.push({ cap: '还需再吃', value: count(result.fruitShort) + ' 颗' });
                }
            }
            return {
                note: '',
                headline: [{ cap: '需要经验', value: count(result.exp) }],
                details,
            };
        }
        default:
            return NONE;
    }
});
</script>

<template>
    <ToolPageShell title="养成计算器" desc="单项计算 · 角色预算">
        <template v-if="costs" #actions>
            <GlassSegmented v-if="glass" v-model:value="mode" class="lg-status-tabs" aria-label="计算方式">
                <GlassSegment v-for="option in MODES" :key="option.value" :value="option.value">{{ option.label }}</GlassSegment>
            </GlassSegmented>
            <SegmentedPills v-else v-model="mode" :options="MODES" label="计算方式" />
        </template>
        <div class="growth-calculator" :class="{ 'growth-single': mode === 'single', 'lg-form-fields': glass }">
            <LoadNotice :error="levelCostsError" :load="reload" />

            <template v-if="costs">
                <div v-if="openedPlan" v-show="mode === 'plan'">
                    <GrowthPlan :costs="costs" :reload-roster="reloadRoster" />
                </div>
                <template v-if="mode === 'single'">
                    <component :is="surface" v-bind="surfaceProps" class="calc-directory">
                        <div v-if="glass" class="calc-controls">
                            <GlassSegmented v-model:value="category" aria-label="计算类别">
                                <GlassSegment v-for="item in categories" :key="item.value" :value="item.value">
                                    {{ item.label }}
                                </GlassSegment>
                            </GlassSegmented>
                            <div class="calc-project-scroll">
                                <GlassSegmented :key="category" class="calc-project" :value="active" aria-label="计算项目" @update:value="pickProject">
                                    <GlassSegment v-for="item in projects" :key="item.value" :value="item.value">
                                        {{ item.label }}
                                    </GlassSegment>
                                </GlassSegmented>
                            </div>
                        </div>
                        <div v-else class="calc-choice">
                            <span>类别</span>
                            <SegmentedPills v-model="category" :options="categories" label="计算类别" wrap />
                        </div>
                        <div v-if="!glass" class="calc-choice">
                            <span>项目</span>
                            <SegmentedPills v-model="active" :options="projects" label="计算项目" wrap />
                        </div>
                    </component>

                    <div class="calc-panel growth-layout">
                        <LedgerSection
                            plain
                            class="growth-card"
                            :title="activeType.name"
                            :hint="activeType.inputHint"
                        >
                            <div class="calc-fields growth-field-grid">
                                <div v-if="pickField" class="growth-input-row growth-pick-row">
                                    <span class="field-label">{{ pickField.label }}</span>
                                    <component
                                        :is="selectControl"
                                        v-model="current.pick"
                                        :label="pickField.label"
                                        :options="pickField.options"
                                        :hide-label="glass ? true : undefined"
                                    />
                                </div>
                                <label class="growth-input-row">
                                    <span class="field-label">{{ labels.a }}</span>
                                    <component
                                        :is="numberControl"
                                        v-model="current.a"
                                        :label="labels.a"
                                        update-on-input
                                    />
                                </label>
                                <label v-if="labels.b" class="growth-input-row">
                                    <span class="field-label">{{ labels.b }}</span>
                                    <component
                                        :is="numberControl"
                                        v-model="current.b"
                                        :label="labels.b"
                                        v-bind="secondFieldProps"
                                        update-on-input
                                    />
                                </label>
                                <!-- 已飞升转门派多一格「已吃潜能果」：未飞升那条公式没有它。 -->
                                <label
                                    v-if="
                                        labels.c && (active !== 'menpai' || current.pick === 'fly')
                                    "
                                    class="growth-input-row"
                                >
                                    <span class="field-label">{{ labels.c }}</span>
                                    <component
                                        :is="numberControl"
                                        v-model="current.c"
                                        :label="labels.c"
                                        update-on-input
                                    />
                                </label>
                            </div>
                        </LedgerSection>

                        <LedgerSection
                            plain
                            class="growth-card growth-result-card"
                            title="计算结果"
                            :hint="activeType.resultHint"
                        >
                            <p v-if="outcome.note" class="note error" role="alert">
                                {{ outcome.note }}
                            </p>
                            <template v-else>
                                <!-- 主数字并排：经验与梦幻币是这一屏的答案，字号给到账面读数那一档。 -->
                                <div
                                    v-if="outcome.headline.length"
                                    class="calc-amounts growth-amounts"
                                >
                                    <div
                                        v-for="one in outcome.headline"
                                        :key="one.cap"
                                        class="calc-amount growth-amount"
                                    >
                                        <span class="cap">{{ one.cap }}</span>
                                        <strong class="v num">{{ one.value }}</strong>
                                    </div>
                                </div>
                                <dl v-if="outcome.details.length" class="calc-rows growth-readings">
                                    <template v-for="one in outcome.details" :key="one.cap">
                                        <dt>{{ one.cap }}</dt>
                                        <dd class="num">{{ one.value }}</dd>
                                    </template>
                                </dl>
                            </template>
                        </LedgerSection>
                    </div>
                </template>
            </template>
        </div>
    </ToolPageShell>
</template>

<style src="./growth-calculator.css"></style>
