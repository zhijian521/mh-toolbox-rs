<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ModalShell from '../../components/ModalShell.vue';
import PressButton from '../../components/PressButton.vue';
import SelectField from '../../components/SelectField.vue';
import { notify } from '../../composables/use-notify';
import { askConfirm } from '../../composables/use-confirm';
import { useRoster } from '../characters/roster';
import { dayText, todayText } from '../../services/format';
import { amountText, totalsOf, type IncomeEntry } from './income';
import { useIncome } from './income-store';
import { itemIconOf } from './item-icons';
import EntryEditDialog from './EntryEditDialog.vue';

/**
 * 历史收益：**上面选日期，下面是一张可改可删的表格**。
 *
 * ---- 三版试错换来的形态 ----
 *
 * 第一版「一天一行 + 点开逐条」：被否，角色看不清。
 * 第二版「按角色合计表 + 逐条全展开」：被否，前几天的数据被压到屏外。
 * 第三版「一天一行、行内挂角色」：还是不够——用户要的不只是**看**，而是「记错了能改回来」。
 *
 * 现在这一版把两件事分开：
 *   - **筛选在上**：一个日期下拉（含「今天」）+ 一个「回到今天」。选哪天看哪天，不靠滚动找；
 *   - **表格在下**：当天的每一条占一行，时间 / 物品 / 角色 / 金额 / 两枚操作。
 *
 * ---- 为什么换回「流水」而不是「一天一行」 ----
 *
 * 「一天一行」是**汇总视图**，回答「哪天赚了多少」；用户这次要的是**流水视图**，
 * 回答「哪一笔记错了」。汇总压掉了单条的身份（id），没有身份就改不了、删不掉。
 * 所以顶层改成「按天筛选 + 当天流水」，当天的汇总退到顶部一行（笔数 / 净额 / 各角色小计）。
 *
 * ---- 删除要问一句，改不用 ----
 *
 * 改可以再改回来，删不行（账本里没有回收站）。两件事的风险不对等，交互也不该一样。
 */
const emit = defineEmits<{ close: [] }>();

const { entries, removeEntry, updateEntry } = useIncome();
const { roster } = useRoster();

/** 正在看的那一天。默认今天——打开历史的人十次有九次是想核对今天。 */
const picked = ref(todayText());

/** 正在改的那一条。`null` = 没开编辑窗。 */
const editing = ref<IncomeEntry | null>(null);

/**
 * 日期下拉的选项：今天置顶，其余是**有记录的日子**（倒序）。
 *
 * 只列有记录的日子，不铺一个完整日历：空日期选进去只有一句「这一天没有记录」，
 * 而账本关心的是「哪几天有账」。
 */
const dateOptions = computed(() => {
    const now = todayText();
    const others = [...new Set(entries.value.map((one) => one.date))]
        .filter((date) => date !== now)
        .sort()
        .reverse();
    return [
        { value: now, label: '今天' },
        ...others.map((date) => ({ value: date, label: dayText(date, now) })),
    ];
});

/* 选中那天被删空之后，`SelectField` 在选项里找不到它，触发条会退回 placeholder
 * 「未选」——那读起来像控件坏了。这时回到最近的一天。 */
watch(dateOptions, (list) => {
    if (!list.some((one) => one.value === picked.value))
        picked.value = list[0]?.value ?? todayText();
});

/** 当天的流水，新的在上（`createdAt` 倒序）。 */
const rows = computed(() =>
    entries.value
        .filter((one) => one.date === picked.value)
        .sort((a, b) => b.createdAt - a.createdAt),
);

const dayTotals = computed(() => totalsOf(rows.value));

interface WhoSum {
    id: string;
    name: string;
    count: number;
    net: number;
}

/** 当天按角色小计，按净额降序。只服务顶部那一行，不进表格。 */
const dayWho = computed<WhoSum[]>(() => {
    const map = new Map<string, WhoSum>();
    for (const one of rows.value) {
        const id = one.characterId || '';
        const hit = map.get(id) ?? { id, name: whoOf(id), count: 0, net: 0 };
        hit.count += 1;
        hit.net += one.kind === 'expense' ? -one.amount : one.amount;
        map.set(id, hit);
    }
    return [...map.values()].sort((a, b) => b.net - a.net || b.count - a.count);
});

/** 记给谁。空串 = 未指定账户，要显式写出来——空一格会读成「数据缺失」。 */
function whoOf(id: string): string {
    if (!id) return '未指定';
    return roster.value.find((one) => one.id === id)?.name ?? '已删角色';
}

/** `HH:mm`。账本里的时间是「哪一笔」的定位符，不需要秒。 */
function timeOf(at: number): string {
    const one = new Date(at);
    return `${`${one.getHours()}`.padStart(2, '0')}:${`${one.getMinutes()}`.padStart(2, '0')}`;
}

/** 净额与支出都要带 `−`：只靠颜色的话，色弱或打印时一笔亏损会读成收入。 */
function signedOf(value: number): string {
    return value < 0 ? `−${amountText(-value)}` : amountText(value);
}

/** 改：不进确认，改错了还能再改。 */
function save(patch: { amount: number; item: string; characterId: string }) {
    const target = editing.value;
    editing.value = null;
    if (!target) return;

    const result = updateEntry(target.id, patch);
    if (!result.ok) {
        notify.error(result.error);
        return;
    }
    notify.success(`已改好 · ${signedOf(patch.amount)}`);
}

/** 删：先问一句。账本里没有回收站，这一步不可逆。 */
async function remove(one: IncomeEntry) {
    const ok = await askConfirm({
        title: `删掉「${one.item || '未记物品'}」这一条？`,
        note: `${amountText(one.amount)}。删了不能撤回。`,
        confirmText: '删除',
    });
    if (!ok) return;

    removeEntry(one.id);
    notify.success('已删掉一条');
}
</script>

<template>
    <ModalShell title="历史收益" :width="720" @close="emit('close')">
        <!-- 筛选在上：选哪天看哪天，不用滚动找。 -->
        <div class="filters">
            <SelectField
                v-model="picked"
                :options="dateOptions"
                label="看哪一天的账"
                class="date-pick"
            />
            <PressButton
                v-if="picked !== todayText()"
                text="回到今天"
                label="回到今天的账"
                @click="picked = todayText()"
            />
            <span class="sum">
                <span class="dim">{{ dayTotals.count }} 笔</span>
                <span class="net" :class="{ loss: dayTotals.net < 0 }">{{
                    signedOf(dayTotals.net)
                }}</span>
            </span>
        </div>

        <!-- 当天各号小计：表格里有角色列，这一行回答「这一天各号分别多少」。 -->
        <p v-if="dayWho.length" class="who-bar">
            <span
                v-for="row in dayWho"
                :key="row.id"
                class="who-chip"
                :class="{ idle: !row.id, loss: row.net < 0 }"
                >{{ row.name }}<b>{{ signedOf(row.net) }}</b></span
            >
        </p>

        <p v-if="!rows.length" class="note blank">这一天还没有记录。</p>

        <table v-else class="log">
            <thead>
                <tr>
                    <th class="c-time">时间</th>
                    <th>物品</th>
                    <th class="c-who">角色</th>
                    <th class="c-num">金额</th>
                    <th class="c-ops">操作</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="one in rows" :key="one.id">
                    <td class="c-time">{{ timeOf(one.createdAt) }}</td>
                    <td>
                        <!-- flex 包在 td 里的 span 上，不挂在 td 上：td 一旦不是
                             table-cell，整张表的列宽计算会跟着乱。 -->
                        <span class="item-cell">
                            <img
                                v-if="itemIconOf(one.item)"
                                :src="itemIconOf(one.item)"
                                alt=""
                                loading="lazy"
                            />
                            <span class="item-name">{{ one.item || '未记物品' }}</span>
                        </span>
                    </td>
                    <td class="c-who" :class="{ idle: !one.characterId }">
                        {{ whoOf(one.characterId) }}
                    </td>
                    <td class="c-num" :class="{ out: one.kind === 'expense' }">
                        {{
                            one.kind === 'expense'
                                ? `−${amountText(one.amount)}`
                                : amountText(one.amount)
                        }}
                    </td>
                    <td class="c-ops">
                        <span class="ops">
                            <PressButton
                                icon="edit"
                                label="改这一条"
                                size="md"
                                @click="editing = one"
                            />
                            <PressButton
                                icon="trash"
                                label="删这一条"
                                size="md"
                                @click="remove(one)"
                            />
                        </span>
                    </td>
                </tr>
            </tbody>
        </table>

        <template #footer>
            <span class="foot-sum"
                >{{ dayTotals.count }} 笔 · 净额 {{ signedOf(dayTotals.net) }}</span
            >
            <PressButton text="关闭" label="关闭历史收益" @click="emit('close')" />
        </template>

        <!-- 叠在这张窗上面的一层（`ModalShell` 自带弹窗栈，Esc 只关最上面那层）。 -->
        <EntryEditDialog v-if="editing" :entry="editing" @save="save" @close="editing = null" />
    </ModalShell>
</template>

<style scoped>
.filters {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
}
/* 日期条定宽 150：`SelectField` 按内容撑，「今天」与「11月2日」长度不同，
 * 每换一天它会跳一次宽度，右边那行汇总也跟着左右晃。 */
.date-pick {
    width: 150px;
}
.sum {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-left: auto;
}
.sum .dim {
    color: var(--muted);
    font-size: var(--fs-mini);
}
.sum .net {
    color: var(--num);
    font-size: var(--fs-base);
    font-variant-numeric: tabular-nums;
}
.sum .net.loss {
    color: var(--cinnabar);
}

/* 当天各号小计：一行文字，不与表格抢。 */
.who-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 14px;
    margin: 0 0 6px;
}
.who-chip {
    color: var(--ink-2);
    font-size: var(--fs-mini);
    white-space: nowrap;
}
.who-chip b {
    margin-left: 5px;
    color: var(--num);
    font-weight: 400;
    font-variant-numeric: tabular-nums;
}
.who-chip.idle {
    color: var(--muted);
}
.who-chip.loss b {
    color: var(--cinnabar);
}

/* ---------- 流水表 ---------- */
.log {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--fs-sm);
}
.log thead th {
    padding: 5px 6px;
    border-bottom: var(--w-hair) solid var(--rule-2);
    color: var(--muted);
    font-size: var(--fs-mini);
    font-weight: 400;
    letter-spacing: 0.08em;
    text-align: left;
    white-space: nowrap;
}
.log tbody td {
    padding: 4px 6px;
    border-bottom: var(--w-hair) solid var(--rule);
}
.log tbody tr:last-child td {
    border-bottom: 0;
}
.log tbody tr:hover td {
    background: color-mix(in srgb, var(--well) 24%, transparent);
}

.c-time {
    width: 56px;
    color: var(--muted);
    font-size: var(--fs-mini);
    font-variant-numeric: tabular-nums;
}
.c-who {
    width: 110px;
    color: var(--ink-2);
}
.c-who.idle {
    color: var(--muted);
}
/* 数字列右对齐 + `tabular-nums`：这一页要能竖着比大小。 */
.c-num {
    width: 104px;
    color: var(--num);
    text-align: right;
    font-variant-numeric: tabular-nums;
}
.c-num.out {
    color: var(--cinnabar);
}
.c-ops {
    width: 72px;
}

.item-cell {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
}
.item-cell img {
    flex: none;
    width: 16px;
    height: 16px;
    object-fit: contain;
    /* 与速记格同一道「纸化」：别处调过、这里不调，同一件物品在两张屏上是两种饱和度。 */
    filter: sepia(0.22) saturate(0.86) contrast(0.98);
    opacity: 0.94;
}
:global(html.dark) .item-cell img {
    filter: sepia(0.18) saturate(0.8) brightness(0.86);
}
.item-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* 两枚操作并排、靠右：`td` 上不能直接 `display: flex`（会破坏表格列宽），
 * 所以中间夹一层 `span`。 */
.ops {
    display: flex;
    justify-content: flex-end;
    gap: 4px;
}

.blank {
    margin: 26px 0;
    text-align: center;
}
.foot-sum {
    margin-right: auto;
    color: var(--muted);
    font-size: var(--fs-mini);
}
</style>
