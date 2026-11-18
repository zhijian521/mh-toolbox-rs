<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import LedgerSection from '../../components/LedgerSection.vue';
import LoadNotice from '../../components/LoadNotice.vue';
import NumberField from '../../components/NumberField.vue';
import PageShell from '../../components/PageShell.vue';
import PressButton from '../../components/PressButton.vue';
import SelectField from '../../components/SelectField.vue';
import { ledgerMoneyText } from '../../services/format';
import {
    cultivationCost,
    expToGrade,
    levelCosts,
    levelCostsError,
    loadLevelCosts,
    petCultivationCost,
    petLevelCost,
    roleConvention,
    roleExpBetween,
    schoolSkillCost,
} from '../../services/level-costs';

/**
 * 养成计算器：把官网工具箱那七块「手动填两个等级、看要多少」搬进来。
 *
 * ---- 这一版只吃手动输入 ----
 *
 * 不读本机的角色、召唤兽、账簿。理由是先对齐口径：官网那七块全部是「起始等级 +
 * 目标等级 → 代价」，接本机数据只影响**默认值填什么**，不影响算法。把算法钉死之后
 * 再决定哪些字段自动带出来，改动面只有「初值」那一行。
 *
 * ---- 一屏七块，每块一张纸 ----
 *
 * 与闹钟页、活动页同一条：`PageShell` 下面直接摆 `LedgerSection`，不套最外层卡片。
 * 每块自己管三个输入格与一组读数，块与块之间没有共享状态 —— 官网那七块也互不相干，
 * 硬凑一个「总表单」会让人以为改一处会牵动别处。
 *
 * ---- 数字格式 ----
 *
 * 经验按整数千分位（九位数以上必须分位，否则一眼数不清位数）；梦幻币走
 * `ledgerMoneyText`，折成「万」并与全站账面同一个口径。
 */
const router = useRouter();

onMounted(() => {
    void loadLevelCosts();
});

/* `LoadNotice` 要的是「重试这一下」本身，返回值由服务层自己收着（成功写进
 * `levelCosts`，失败写进 `levelCostsError`），所以这里把返回值吃掉。 */
const reload = async () => {
    await loadLevelCosts();
};

/* 读数与「哪些格子没填好」都从这一处出：`costs` 为空时整页只剩提示条。 */
const costs = computed(() => levelCosts.value);

/** 千分位整数。经验动辄十亿，不分位读不出量级。 */
const count = (value: number) => value.toLocaleString('zh-CN');

/** 两个等级是否构成一个官网接受的区间；不构成时给出**这句话**。 */
function rangeNote(from: number, to: number, min: number, cap: number): string {
    if (from < min || from > cap) return '起始等级需在 ' + min + ' 到 ' + cap + ' 之间';
    if (to < min || to > cap) return '目标等级需在 ' + min + ' 到 ' + cap + ' 之间';
    if (from >= to) return '目标等级要比起始等级高';
    return '';
}

/** 一块里的读数：名目 + 已格式化的值。 */
type Rows = { cap: string; value: string }[];

function rowsOf(pairs: [string, string | null][]): Rows {
    return pairs
        .filter((pair) => pair[1] !== null)
        .map(([cap, value]) => ({ cap, value: value as string }));
}

/* ---------- ① 等级换算经验 ---------- */
const roleFrom = ref(0);
const roleTo = ref(175);
const roleNote = computed(() =>
    costs.value ? rangeNote(roleFrom.value, roleTo.value, 0, costs.value.role.cap) : '',
);
const roleRows = computed<Rows>(() => {
    const table = costs.value;
    if (!table || roleNote.value) return [];
    return rowsOf([['需要经验', count(roleExpBetween(table, roleFrom.value, roleTo.value))]]);
});

/* ---------- ② 经验换算等级 ---------- */
const gradeNow = ref(100);
const gradeExp = ref(100000);
const gradeNote = computed(() => {
    const table = costs.value;
    if (!table) return '';
    if (gradeNow.value < 1 || gradeNow.value > table.role.cap) {
        return '当前等级需在 1 到 ' + table.role.cap + ' 之间';
    }
    return '';
});
const gradeRows = computed<Rows>(() => {
    const table = costs.value;
    if (!table || gradeNote.value) return [];
    const result = expToGrade(table, gradeNow.value, gradeExp.value);
    return rowsOf([
        ['可达等级', String(result.grade)],
        ['剩余经验', count(result.left)],
    ]);
});

/* ---------- ③ 人物常规 ---------- */
const conventionLevel = ref(175);
const conventionNote = computed(() => {
    const table = costs.value;
    if (!table) return '';
    if (conventionLevel.value < 1 || conventionLevel.value > table.role.cap) {
        return '人物等级需在 1 到 ' + table.role.cap + ' 之间';
    }
    return '';
});
const conventionRows = computed<Rows>(() => {
    if (!costs.value || conventionNote.value) return [];
    const result = roleConvention(conventionLevel.value);
    return rowsOf([
        /* 官网那一格 19 级及以下写的就是「无」：技能没有上限，不是上限为零。 */
        ['人物技能要求', result.skillCap === null ? '无' : String(result.skillCap)],
        ['携带金钱上限', ledgerMoneyText(result.moneyCap)],
    ]);
});

/* ---------- ④ 师门技能 ---------- */
const skillFrom = ref(0);
const skillTo = ref(180);
const skillNote = computed(() =>
    costs.value ? rangeNote(skillFrom.value, skillTo.value, 0, costs.value.schoolSkill.cap) : '',
);
const skillRows = computed<Rows>(() => {
    const table = costs.value;
    if (!table || skillNote.value) return [];
    const result = schoolSkillCost(table, skillFrom.value, skillTo.value);
    return rowsOf([
        ['需要经验', count(result.exp)],
        ['需要梦幻币', ledgerMoneyText(result.cash)],
    ]);
});

/* ---------- ⑤ 人物修炼 ---------- */
const cultType = ref('1');
const cultFrom = ref(0);
const cultTo = ref(25);
const cultOptions = computed(() =>
    (costs.value?.cultivation.types ?? []).map((one) => ({
        value: String(one.id),
        label: one.name,
    })),
);
/** 选中类型的上限：猎术 20，其余 25。区间校验按它算，不写死 25。 */
const cultCap = computed(() => {
    const id = Number(cultType.value);
    return costs.value?.cultivation.types.find((one) => one.id === id)?.cap ?? 25;
});
const cultNote = computed(() =>
    costs.value ? rangeNote(cultFrom.value, cultTo.value, 0, cultCap.value) : '',
);
const cultRows = computed<Rows>(() => {
    const table = costs.value;
    if (!table || cultNote.value) return [];
    const result = cultivationCost(table, Number(cultType.value), cultFrom.value, cultTo.value);
    if (!result) return [];
    return rowsOf([
        ['需要修炼经验', count(result.exp)],
        ['需要梦幻币', ledgerMoneyText(result.cash)],
        ['需要资材', count(result.material)],
        /* 帮贡与人物等级要求取目标等级那一级，不随区间增长。 */
        ['需要帮贡', count(result.bond)],
        ['人物等级要求', String(result.minRoleLevel)],
    ]);
});

/* ---------- ⑥ 召唤兽修炼 ---------- */
const petCultFrom = ref(0);
const petCultTo = ref(25);
const petCultNote = computed(() => rangeNote(petCultFrom.value, petCultTo.value, 0, 25));
const petCultRows = computed<Rows>(() => {
    const table = costs.value;
    if (!table || petCultNote.value) return [];
    const result = petCultivationCost(table, petCultFrom.value, petCultTo.value);
    return rowsOf([
        ['需要修炼经验', count(result.exp)],
        ['人物等级要求', String(result.minRoleLevel)],
        ['100 环数量', result.rounds100 + ' 轮'],
    ]);
});

/* ---------- ⑦ 召唤兽升级 ---------- */
const petFrom = ref(1);
const petTo = ref(180);
const petNote = computed(() => {
    const table = costs.value;
    if (!table) return '';
    return rangeNote(petFrom.value, petTo.value, 1, table.petLevel.cap);
});
const petRows = computed<Rows>(() => {
    const table = costs.value;
    if (!table || petNote.value) return [];
    const result = petLevelCost(table, petFrom.value, petTo.value);
    return rowsOf([
        ['需要经验', count(result.exp)],
        ['需要月华露', count(result.moonDew) + ' 个'],
    ]);
});
</script>

<template>
    <PageShell title="养成计算器" desc="手动输入 · 与官网工具箱同口径">
        <template #actions>
            <!-- 与捉鬼、闹钟页同一枚：图标读动作方向，字只写动词，完整语义在 label 里。 -->
            <PressButton
                icon="back"
                text="返回"
                label="返回工具列表"
                @click="router.push('/tools')"
            />
        </template>

        <LoadNotice :error="levelCostsError" :load="reload" />

        <template v-if="costs">
            <LedgerSection title="等级换算经验" hint="人物 0 到 175 级">
                <div class="calc-fields">
                    <label class="form-field">
                        <span class="field-label">当前等级</span>
                        <NumberField v-model="roleFrom" label="当前等级" />
                    </label>
                    <label class="form-field">
                        <span class="field-label">目标等级</span>
                        <NumberField v-model="roleTo" label="目标等级" />
                    </label>
                </div>
                <p v-if="roleNote" class="note error" role="alert">{{ roleNote }}</p>
                <dl v-else class="calc-rows">
                    <template v-for="row in roleRows" :key="row.cap">
                        <dt>{{ row.cap }}</dt>
                        <dd class="num">{{ row.value }}</dd>
                    </template>
                </dl>
            </LedgerSection>

            <LedgerSection title="经验换算等级" hint="当前等级 + 手上经验">
                <div class="calc-fields">
                    <label class="form-field">
                        <span class="field-label">当前等级</span>
                        <NumberField v-model="gradeNow" label="当前等级" />
                    </label>
                    <label class="form-field">
                        <span class="field-label">当前经验</span>
                        <NumberField v-model="gradeExp" label="当前经验" />
                    </label>
                </div>
                <p v-if="gradeNote" class="note error" role="alert">{{ gradeNote }}</p>
                <dl v-else class="calc-rows">
                    <template v-for="row in gradeRows" :key="row.cap">
                        <dt>{{ row.cap }}</dt>
                        <dd class="num">{{ row.value }}</dd>
                    </template>
                </dl>
            </LedgerSection>

            <LedgerSection title="人物常规" hint="技能上限与携带金钱">
                <div class="calc-fields">
                    <label class="form-field">
                        <span class="field-label">人物等级</span>
                        <NumberField v-model="conventionLevel" label="人物等级" />
                    </label>
                </div>
                <p v-if="conventionNote" class="note error" role="alert">
                    {{ conventionNote }}
                </p>
                <dl v-else class="calc-rows">
                    <template v-for="row in conventionRows" :key="row.cap">
                        <dt>{{ row.cap }}</dt>
                        <dd class="num">{{ row.value }}</dd>
                    </template>
                </dl>
            </LedgerSection>

            <LedgerSection title="师门技能" hint="单项技能 0 到 180 级">
                <div class="calc-fields">
                    <label class="form-field">
                        <span class="field-label">当前等级</span>
                        <NumberField v-model="skillFrom" label="技能当前等级" />
                    </label>
                    <label class="form-field">
                        <span class="field-label">目标等级</span>
                        <NumberField v-model="skillTo" label="技能目标等级" />
                    </label>
                </div>
                <p v-if="skillNote" class="note error" role="alert">{{ skillNote }}</p>
                <dl v-else class="calc-rows">
                    <template v-for="row in skillRows" :key="row.cap">
                        <dt>{{ row.cap }}</dt>
                        <dd class="num">{{ row.value }}</dd>
                    </template>
                </dl>
            </LedgerSection>

            <LedgerSection title="人物修炼" hint="帮贡与等级要求取目标等级">
                <div class="calc-fields">
                    <label class="form-field cult-type">
                        <span class="field-label">类型</span>
                        <SelectField v-model="cultType" :options="cultOptions" label="修炼类型" />
                    </label>
                    <label class="form-field">
                        <span class="field-label">当前等级</span>
                        <NumberField v-model="cultFrom" label="修炼当前等级" />
                    </label>
                    <label class="form-field">
                        <span class="field-label">目标等级</span>
                        <NumberField v-model="cultTo" label="修炼目标等级" />
                    </label>
                </div>
                <p v-if="cultNote" class="note error" role="alert">{{ cultNote }}</p>
                <dl v-else class="calc-rows">
                    <template v-for="row in cultRows" :key="row.cap">
                        <dt>{{ row.cap }}</dt>
                        <dd class="num">{{ row.value }}</dd>
                    </template>
                </dl>
            </LedgerSection>

            <LedgerSection title="召唤兽修炼" hint="0 到 25 级 · 按 100 环估算">
                <div class="calc-fields">
                    <label class="form-field">
                        <span class="field-label">当前等级</span>
                        <NumberField v-model="petCultFrom" label="召唤兽修炼当前等级" />
                    </label>
                    <label class="form-field">
                        <span class="field-label">目标等级</span>
                        <NumberField v-model="petCultTo" label="召唤兽修炼目标等级" />
                    </label>
                </div>
                <p v-if="petCultNote" class="note error" role="alert">
                    {{ petCultNote }}
                </p>
                <dl v-else class="calc-rows">
                    <template v-for="row in petCultRows" :key="row.cap">
                        <dt>{{ row.cap }}</dt>
                        <dd class="num">{{ row.value }}</dd>
                    </template>
                </dl>
            </LedgerSection>

            <LedgerSection title="召唤兽升级" hint="1 到 180 级 · 含月华露">
                <div class="calc-fields">
                    <label class="form-field">
                        <span class="field-label">当前等级</span>
                        <NumberField v-model="petFrom" label="召唤兽当前等级" />
                    </label>
                    <label class="form-field">
                        <span class="field-label">目标等级</span>
                        <NumberField v-model="petTo" label="召唤兽目标等级" />
                    </label>
                </div>
                <p v-if="petNote" class="note error" role="alert">{{ petNote }}</p>
                <dl v-else class="calc-rows">
                    <template v-for="row in petRows" :key="row.cap">
                        <dt>{{ row.cap }}</dt>
                        <dd class="num">{{ row.value }}</dd>
                    </template>
                </dl>
            </LedgerSection>
        </template>
    </PageShell>
</template>

<style scoped>
/* 一格输入 = 一行小标签 + 一个凹槽。竖排而不是横排：格子上方那行标签是「这一格是什么」，
 * 横排时几个标签连成一句，读起来像一句话而不是几格。 */
.calc-fields {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 16px;
    align-items: flex-end;
}
/* 类型下拉比等级格宽一档：五个选项的名字（「抗法修炼」）四个字，72 宽会截断。 */
.cult-type {
    width: 132px;
}

/* 读数区：左列名目、右列数字。名目列宽按最长的一项定（「需要修炼经验」六个字），
 * 数字才在七块之间左缘对齐。 */
.calc-rows {
    display: grid;
    grid-template-columns: 7.5em minmax(0, 1fr);
    gap: 0;
    margin: 14px 0 0;
}
.calc-rows dt,
.calc-rows dd {
    margin: 0;
    padding: 6px 0;
    border-top: 1px dashed var(--rule-2);
    font-size: var(--fs-sm);
    line-height: 1.5;
}
.calc-rows dt {
    color: var(--muted);
}
.calc-rows dd {
    overflow-wrap: anywhere;
    font-variant-numeric: tabular-nums;
}
/* 数字是这块的主角：与统计签同一个赭色。 */
.calc-rows .num {
    color: var(--num);
}
</style>
