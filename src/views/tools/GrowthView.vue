<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, reactive, ref, watch } from 'vue';
import LedgerSection from '../../components/LedgerSection.vue';
import LoadNotice from '../../components/LoadNotice.vue';
import NumberField from '../../components/NumberField.vue';
import ToolPageShell from './ToolPageShell.vue';
import SelectField from '../../components/SelectField.vue';
import SegmentedPills from '../../components/SegmentedPills.vue';
import { useRovingFocus } from '../../composables/use-roving-focus';
import { ledgerMoneyText } from '../../services/format';
import {
    cultivationCost,
    expToGrade,
    gemCost,
    guildShopQuota,
    levelCosts,
    levelCostsError,
    lifeSkillCost,
    lifeSkillOf,
    loadLevelCosts,
    MENPAI_FLY_MIN_LEVEL,
    menpaiCost,
    petCultivationCost,
    petLevelCost,
    petScenesAt,
    qianNengGuoCost,
    qianYuanDanCost,
    roleConvention,
    roleExpBetween,
    schoolSkillCost,
} from '../../services/level-costs';

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
    | 'convention'
    | 'schoolSkill'
    | 'lifeSkill'
    | 'cultivation'
    | 'petCultivation'
    | 'petLevel'
    | 'qianYuanDan'
    | 'qianNengGuo'
    | 'menpai'
    | 'gem'
    | 'guildShop'
    | 'petScene';

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
        key: 'convention',
        tag: '人物',
        name: '人物常规',
        inputHint: '1 到 175 级',
        resultHint: '升级技能要求与携带金钱',
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
    {
        key: 'gem',
        tag: '物品',
        name: '宝石合成',
        inputHint: '普通 20 级、星辉 11 级',
        resultHint: '要几颗 1 级',
    },
    {
        key: 'guildShop',
        tag: '帮派',
        name: '商会免税',
        inputHint: '商业指数与间数',
        resultHint: '需卖出的营业额',
    },
    {
        key: 'petScene',
        tag: '召唤兽',
        name: '练级场景',
        inputHint: '0 到 175 级',
        resultHint: '能满经验的场景',
    },
];

/** 每张卡的格子叫什么。空串表示这一格不显示；`c` 只在少数几项出现。 */
const FIELD_LABELS: Record<CalcKey, { a: string; b: string; c: string }> = {
    role: { a: '当前等级', b: '目标等级', c: '' },
    expGrade: { a: '当前等级', b: '手上经验', c: '' },
    convention: { a: '人物等级', b: '', c: '' },
    schoolSkill: { a: '当前等级', b: '目标等级', c: '' },
    lifeSkill: { a: '当前等级', b: '目标等级', c: '' },
    cultivation: { a: '当前等级', b: '目标等级', c: '' },
    petCultivation: { a: '当前等级', b: '目标等级', c: '' },
    petLevel: { a: '当前等级', b: '目标等级', c: '' },
    qianYuanDan: { a: '已有颗数', b: '目标颗数', c: '' },
    qianNengGuo: { a: '已有颗数', b: '目标颗数', c: '' },
    /* 未飞升只填前两格；已飞升多一格「已吃潜能果」。 */
    menpai: { a: '人物等级', b: '人物总经验', c: '已吃潜能果' },
    gem: { a: '目标等级', b: '1 级单价（万）', c: '' },
    guildShop: { a: '商业指数', b: '店铺间数', c: '' },
    petScene: { a: '召唤兽等级', b: '', c: '' },
};

/**
 * 十四项的输入各自存一份：换卡再换回来，刚才填的数还在。
 * `pick` 是「这一项里选哪一个」：辅助技能、修炼类型、宝石档位、转门派是否飞升。
 */
const form = reactive<Record<CalcKey, { a: number; b: number; c: number; pick: string }>>({
    role: { a: 0, b: 175, c: 0, pick: '' },
    expGrade: { a: 100, b: 100000, c: 0, pick: '' },
    convention: { a: 175, b: 0, c: 0, pick: '' },
    schoolSkill: { a: 0, b: 180, c: 0, pick: '' },
    /* 默认强身术：上限 140，是 21 项里最常点的一项。 */
    lifeSkill: { a: 0, b: 140, c: 0, pick: '201' },
    cultivation: { a: 0, b: 25, c: 0, pick: '1' },
    petCultivation: { a: 0, b: 25, c: 0, pick: '' },
    petLevel: { a: 1, b: 180, c: 0, pick: '' },
    qianYuanDan: { a: 0, b: 9, c: 0, pick: '' },
    qianNengGuo: { a: 0, b: 50, c: 0, pick: '' },
    menpai: { a: 129, b: 0, c: 0, pick: 'nofly' },
    gem: { a: 5, b: 1, c: 0, pick: 'putong' },
    guildShop: { a: 100, b: 2, c: 0, pick: '' },
    petScene: { a: 80, b: 0, c: 0, pick: '' },
});

const active = ref<CalcKey>('role');
const activeType = computed(() => TYPES.find((one) => one.key === active.value) ?? TYPES[0]);
const current = computed(() => form[active.value]);
const labels = computed(() => FIELD_LABELS[active.value]);

/* 换项目只换卡，键盘仍按「一组里选一个」走：整组一个 Tab 停靠点、方向键换卡。 */
const { cells, tabIndexFor, onKeydown } = useRovingFocus<CalcKey>({
    values: () => TYPES.map((one) => one.key),
    activeValue: () => active.value,
    pick: (index) => {
        const next = TYPES[index];
        if (next) active.value = next.key;
    },
    axis: 'horizontal',
});

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
const gemOptions = computed(() =>
    (costs.value?.gem.types ?? []).map((one) => ({
        value: one.id,
        label: `${one.name}（${one.cap} 级）`,
    })),
);
/* 转门派两条分支：官网是两个独立入口，公式只差「潜能果」那一格。 */
const MENPAI_OPTIONS = [
    { value: 'nofly', label: '未飞升' },
    { value: 'fly', label: '已飞升' },
];

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
                  : active.value === 'gem'
                    ? (table.gem.types.find((one) => one.id === current.value.pick)?.cap ?? 0)
                    : 0;
        /* 宝石那一格是「目标等级」（`a`），其余几项收的是「目标等级」（`b`）。 */
        if (!cap) return;
        const level = active.value === 'gem' ? current.value.a : current.value.b;
        if (level > cap) {
            if (active.value === 'gem') current.value.a = cap;
            else current.value.b = cap;
        }
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
        case 'convention': {
            if (input.a < 1 || input.a > table.role.cap) {
                return { ...NONE, note: `人物等级需在 1 到 ${table.role.cap} 之间` };
            }
            const result = roleConvention(input.a);
            return {
                note: '',
                headline: [{ cap: '携带金钱上限', value: ledgerMoneyText(result.moneyCap) }],
                /* 这里是升级所需技能要求，不是师门技能可学上限。 */
                details: [
                    {
                        cap: '人物技能要求',
                        value: result.skillCap === null ? '无' : String(result.skillCap),
                    },
                ],
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
        case 'gem': {
            const type = table.gem.types.find((one) => one.id === input.pick);
            if (!type) return { ...NONE, note: '请选择宝石档位' };
            const result = gemCost(table, type.id, input.a, input.b * 10_000);
            if (!result)
                return { ...NONE, note: `等级需在 1 到 ${type.cap} 之间，单价需为有效金额` };
            return {
                note: '',
                headline: [{ cap: '需要 1 级', value: count(result.total) + ' 颗' }],
                details: [
                    ...(input.a >= 2
                        ? [{ cap: `${input.a - 1} 级等价数量`, value: count(result.lower) + ' 颗' }]
                        : []),
                    ...(input.a >= 3
                        ? [
                              {
                                  cap: `${input.a - 2} 级等价数量`,
                                  value: count(result.lower2) + ' 颗',
                              },
                          ]
                        : []),
                    { cap: '折合花费', value: ledgerMoneyText(result.money) },
                ],
            };
        }
        case 'guildShop': {
            if (input.a <= 0) return { ...NONE, note: '商业指数要大于 0' };
            if (input.b < 1) return { ...NONE, note: '店铺间数至少 1 间' };
            const quota = guildShopQuota(input.a, input.b);
            if (!Number.isSafeInteger(quota)) return { ...NONE, note: '营业额超出计算范围' };
            return {
                note: '',
                headline: [
                    {
                        cap: '需卖出的营业额',
                        value: ledgerMoneyText(quota),
                    },
                ],
                details: [{ cap: '换算口径', value: '指数 × 1000 × 间数' }],
            };
        }
        case 'petScene': {
            if (input.a < 0 || input.a > 175)
                return { ...NONE, note: '召唤兽等级需在 0 到 175 之间' };
            const scenes = petScenesAt(table, input.a);
            if (!scenes.length) return { ...NONE, note: '这一级没有能吃满经验的场景' };
            return {
                note: '',
                /* 场景经验是「五人组队领双」的单场值，与召唤兽等级无关，所以不求和只列区间。 */
                headline: [{ cap: '满经验场景', value: scenes.length + ' 处' }],
                details: scenes.map((one) => ({
                    cap: one.name,
                    value: `${one.min}–${one.max} 级 · ${count(one.exp)}`,
                })),
            };
        }
        default:
            return NONE;
    }
});
</script>

<template>
    <ToolPageShell title="养成计算器" desc="单项计算 · 角色预算">
        <div class="growth-calculator">
            <LoadNotice :error="levelCostsError" :load="reload" />

            <template v-if="costs">
                <SegmentedPills
                    v-model="mode"
                    :options="MODES"
                    label="计算方式"
                    class="calc-mode"
                />
                <div v-if="openedPlan" v-show="mode === 'plan'">
                    <GrowthPlan :costs="costs" />
                </div>
                <template v-if="mode === 'single'">
                    <!-- 类型卡共用纸面材质。用 `button` 而不是把纸包在按钮里——按钮里只能放行内内容，
                 而这一格既要是纸（`.board`）、又要能被点与键盘选中。材质仍走全局那一条，
                 这里只加边与选中记号。 -->
                    <div
                        class="calc-picks"
                        role="radiogroup"
                        aria-label="计算项目"
                        @keydown="onKeydown"
                    >
                        <button
                            v-for="(one, i) in TYPES"
                            :key="one.key"
                            ref="cells"
                            type="button"
                            class="board board-plain calc-pick"
                            role="radio"
                            :aria-checked="one.key === active"
                            :tabindex="tabIndexFor(i)"
                            @click="active = one.key"
                        >
                            <span class="calc-pick-tag">{{ one.tag }}</span>
                            <span class="calc-pick-name">{{ one.name }}</span>
                            <span class="calc-pick-mark" aria-hidden="true" />
                        </button>
                    </div>

                    <div class="calc-panel growth-layout">
                        <LedgerSection
                            plain
                            class="growth-card"
                            :title="activeType.name"
                            :hint="activeType.inputHint"
                        >
                            <div class="calc-fields growth-field-grid">
                                <label
                                    v-if="active === 'lifeSkill'"
                                    class="slip-row sm growth-input-row growth-pick-row"
                                >
                                    <span class="field-label">技能</span>
                                    <SelectField
                                        v-model="current.pick"
                                        :options="lifeOptions"
                                        label="辅助技能"
                                    />
                                </label>
                                <label
                                    v-if="active === 'cultivation'"
                                    class="slip-row sm growth-input-row growth-pick-row"
                                >
                                    <span class="field-label">类型</span>
                                    <SelectField
                                        v-model="current.pick"
                                        :options="cultOptions"
                                        label="修炼类型"
                                    />
                                </label>
                                <label
                                    v-if="active === 'gem' || active === 'menpai'"
                                    class="slip-row sm growth-input-row growth-pick-row"
                                >
                                    <span class="field-label">{{
                                        active === 'gem' ? '档位' : '阶段'
                                    }}</span>
                                    <SelectField
                                        v-model="current.pick"
                                        :options="active === 'gem' ? gemOptions : MENPAI_OPTIONS"
                                        :label="active === 'gem' ? '宝石档位' : '飞升阶段'"
                                    />
                                </label>
                                <label class="slip-row sm growth-input-row">
                                    <span class="field-label">{{ labels.a }}</span>
                                    <NumberField
                                        v-model="current.a"
                                        :label="labels.a"
                                        update-on-input
                                    />
                                </label>
                                <label v-if="labels.b" class="slip-row sm growth-input-row">
                                    <span class="field-label">{{ labels.b }}</span>
                                    <NumberField
                                        v-model="current.b"
                                        :label="labels.b"
                                        :precision="active === 'gem' ? 2 : 0"
                                        update-on-input
                                    />
                                </label>
                                <!-- 已飞升转门派多一格「已吃潜能果」：未飞升那条公式没有它。 -->
                                <label
                                    v-if="
                                        labels.c && (active !== 'menpai' || current.pick === 'fly')
                                    "
                                    class="slip-row sm growth-input-row"
                                >
                                    <span class="field-label">{{ labels.c }}</span>
                                    <NumberField
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
                            title="需要多少"
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
                                    :style="{ '--amount-n': outcome.headline.length }"
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

<style scoped>
.calc-mode {
    width: fit-content;
    margin-bottom: 12px;
}
/* 项目入口保持统一窄卡宽度，窗口加宽只增加列数。 */
.calc-picks {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 152px), 168px));
    justify-content: start;
    gap: 8px;
    margin-bottom: 12px;
}
/* 留一圈透明边：选中时只换边色，卡片不会因此跳 2px（与 `.character-choice` 同一手法）。 */
.calc-pick {
    display: grid;
    gap: 3px;
    min-width: 0;
    padding: 8px 10px;
    border: var(--w-hair) solid transparent;
    text-align: left;
    cursor: pointer;
}
.calc-pick:hover {
    border-color: var(--rule-2);
}
.calc-pick[aria-checked='true'] {
    border-color: var(--seal-edge);
}
.calc-pick-tag {
    color: var(--muted);
    font-size: var(--fs-mini);
    letter-spacing: 0.08em;
}
.calc-pick-name {
    color: var(--ink);
    font-size: var(--fs-sm);
    line-height: 1.4;
}
/* 选中记号是一道短朱条，不换字号字重（CONVENTIONS §2.4-9）。 */
.calc-pick-mark {
    width: 22px;
    height: 2px;
    margin-top: 3px;
    border-radius: 1px;
    background: transparent;
}
.calc-pick[aria-checked='true'] .calc-pick-mark {
    background: var(--accent);
}
</style>
