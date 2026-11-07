<script setup lang="ts">
import SaveNotice from '../../components/SaveNotice.vue';
import { useToday } from '../../composables/use-today';
import { computed, ref } from 'vue';
import AppIcon from '../../components/AppIcon.vue';
import LedgerSection from '../../components/LedgerSection.vue';
import PaperCard from '../../components/PaperCard.vue';
import PageShell from '../../components/PageShell.vue';
import PressButton from '../../components/PressButton.vue';
import PressTile from '../../components/PressTile.vue';
import SegmentedPills from '../../components/SegmentedPills.vue';
import SelectField from '../../components/SelectField.vue';
import { saved } from '../../composables/save-feedback';
import { notify } from '../../composables/use-notify';
import { shortDate } from '../../services/format';
import { characterName, useRoster } from '../characters/roster';
import AccountEditor from './AccountEditor.vue';
import AccountRecords from './AccountRecords.vue';
import {
    CURRENCY_META,
    RANGE_PRESETS,
    SHORTCUTS,
    accountStats,
    amountText,
    entriesIn,
    newestFirst,
    rangeOf,
    type AccountEntry,
    type Currency,
    type RangePreset,
} from './accounts';
import { useAccounts, type EntryInput } from './accounts-store';

/**
 * 账号：人民币与梦幻币**两本独立的账**。
 *
 * ---- 为什么不合成一个「总收支」 ----
 * 元与万不是一个量级的东西，加起来只是把两个数拼在一起。所以上面并排两张汇总卡，
 * 各回答「这一本账怎么样」；下面明细里每条带着自己的币种，从不让它们出现在同一个数里。
 *
 * ---- 这一页的主入口是「快捷记账」 ----
 * 记账号收支的难处不在金额，在**四个字段要对**：方向、币种、分类、渠道。连着点四个下拉，
 * 点错哪个都不会报错，只会让两本账各错一笔。所以按「这个游戏里钱的所有走法」摆了十一个
 * 块，点一下就把四个字段填好，剩下的只是金额（与收益页的物品速记同一种思路：
 * 高频动作不该穿过一张表单）。
 */
const { entries, loadError, writeError, addEntry, updateEntry, pending, flush, retry } =
    useAccounts();
const { roster } = useRoster();

/* ---------- 筛选 ---------- */
const preset = ref<RangePreset>('month');

/**
 * 「全部角色」的哨兵值。
 *
 * 不能是空串：`SelectField` 把空串当「没有值」，选中它之后触发条会退回 placeholder
 * 「未选」，与事实不符。这一条与 `EntryEditDialog` 里那个 `__none__` 是同一个坑。
 */
const ALL = '__all__';
const who = ref(ALL);

const whoOptions = computed(() => [
    { value: ALL, label: '全部角色' },
    ...roster.value.map((one) => ({ value: one.id, label: one.name })),
]);

const today = useToday();
const range = computed(() => rangeOf(preset.value, today.value));

/**
 * 当前范围 + 当前角色筛出来的那些条。页面上的**每一个数**都从这一份出发——
 * 汇总卡、最近记录、底部的条数。三处各算一次的话，用户会看到「3 笔」与表里 5 行。
 */
const scoped = computed(() =>
    entriesIn(entries.value, range.value.from, range.value.to, who.value === ALL ? '' : who.value),
);

const books = computed(() =>
    (['rmb', 'cash'] as Currency[]).map((currency) => ({
        currency,
        meta: CURRENCY_META[currency],
        stats: accountStats(scoped.value, currency),
    })),
);

/** 最近八条。页面只露一小段，完整浏览在「全部记录」里。 */
const recent = computed(() => newestFirst(scoped.value).slice(0, 8));

/* ---------- 记账 ---------- */
const editing = ref<{ entry?: AccountEntry; seed?: Partial<EntryInput> } | null>(null);
const recordsOpen = ref(false);

function openBlank(seed?: Partial<EntryInput>) {
    editing.value = { seed };
}

function openEntry(entry: AccountEntry) {
    editing.value = { entry };
}

/** 新建与「改一条」共用同一个窗，区别只在 `entry` 有没有。 */
async function save(input: EntryInput) {
    if (pending.value > 0) return;
    const target = editing.value?.entry;
    const result = target ? updateEntry(target.id, input) : addEntry(input);
    if (!result.ok) {
        notify.error(result.error);
        return;
    }
    editing.value = { entry: result.entry };
    const source = editing.value;
    if (!(await saved(flush))) return;
    /* 回执用**落库那条**的金额：输入框里是「万」，换算成原值的那一步在 store 里，
     * 这里再乘一次 10000 就是把这个换算写两遍。 */
    notify.success(
        target
            ? `已改 ${result.entry.category} ${amountText(result.entry.amount, result.entry.currency)}`
            : `已记 ${result.entry.category} ${amountText(result.entry.amount, result.entry.currency)}`,
    );
    if (editing.value === source) editing.value = null;
}
</script>

<template>
    <PageShell title="账号" desc="人民币与梦幻币，两本独立的账">
        <template #actions>
            <PressButton icon="add" text="记一笔" label="记一笔账号收支" @click="openBlank()" />
        </template>

        <p v-if="loadError" class="note error">{{ loadError }}</p>
        <SaveNotice :error="writeError" :pending="pending" @retry="retry" />

        <!-- 筛选条：时间三档 + 角色。两者同时作用于下面每一个数。 -->
        <PaperCard class="filters">
            <SegmentedPills v-model="preset" :options="RANGE_PRESETS" label="账目时间范围" />
            <SelectField v-model="who" :options="whoOptions" label="按角色筛选" class="who-pick" />
            <span class="range-text">
                {{ range.from ? `${range.from} 至 ${range.to}` : '全部时间' }}
            </span>
        </PaperCard>

        <!-- 两本账各一张卡。两张卡的底边必须齐平——并排看时一高一矮会读成
             「其中一本没记完」。 -->
        <div class="books">
            <PaperCard v-for="book in books" :key="book.currency" as="article" class="book">
                <header class="book-head">
                    <h2>{{ book.meta.label }}</h2>
                    <span class="book-note">按{{ book.meta.unit }}记</span>
                    <span class="book-count">{{ book.stats.count }} 笔</span>
                </header>
                <div class="metrics">
                    <div>
                        <span class="cap">收入</span>
                        <b class="in">{{ amountText(book.stats.income, book.currency) }}</b>
                    </div>
                    <div>
                        <span class="cap">支出</span>
                        <b class="out">{{ amountText(book.stats.expense, book.currency) }}</b>
                    </div>
                    <div>
                        <span class="cap">差额</span>
                        <!-- 负数必须带符号：只在颜色上转朱时，一个「15 万」会被读成「赚了 15 万」。 -->
                        <b :class="book.stats.net < 0 ? 'out' : 'in'">
                            {{
                                book.stats.net < 0
                                    ? `−${amountText(-book.stats.net, book.currency)}`
                                    : amountText(book.stats.net, book.currency)
                            }}
                        </b>
                    </div>
                </div>
            </PaperCard>
        </div>

        <!-- 快捷记账：点一下把方向 / 币种 / 分类 / 渠道填好，只差金额。 -->
        <LedgerSection title="快捷记账">
            <div class="shortcuts">
                <button
                    v-for="one in SHORTCUTS"
                    :key="one.id"
                    type="button"
                    class="shortcut"
                    :aria-label="`${one.title}，${one.hint}`"
                    @click="openBlank({ ...one.preset })"
                >
                    <PressTile class="sc-tile">
                        <span class="sc-top">
                            <AppIcon :name="one.icon" />
                            <!-- 方向只用一个字：这块的宽度装不下「收入/支出」四个字，
                                 而朱与赭已经能把两边分开（红点是「出钱」，赭是「进钱」）。 -->
                            <span class="sc-kind" :class="one.preset.kind">
                                {{ one.preset.kind === 'income' ? '收' : '支' }}
                            </span>
                        </span>
                        <span class="sc-title">{{ one.title }}</span>
                        <span class="sc-hint">{{ one.hint }}</span>
                    </PressTile>
                </button>
            </div>
        </LedgerSection>

        <!-- 最近记录：点一行打开编辑。完整浏览在「全部记录」里。 -->
        <LedgerSection title="最近记录" :hint="`共 ${scoped.length} 笔`" class="records">
            <p v-if="!recent.length" class="note blank">这个范围还没有记录</p>

            <table v-else class="recent-table">
                <thead>
                    <tr>
                        <th class="c-date">日期</th>
                        <th>分类</th>
                        <th>说明</th>
                        <th class="c-who">角色</th>
                        <th class="c-channel">渠道</th>
                        <th class="c-num">金额</th>
                    </tr>
                </thead>
                <tbody>
                    <tr
                        v-for="one in recent"
                        :key="one.id"
                        class="row"
                        tabindex="0"
                        role="button"
                        :aria-label="`${one.date} ${one.category} ${amountText(one.amount, one.currency)}，点一下改这一条`"
                        @click="openEntry(one)"
                        @keydown.enter.prevent="openEntry(one)"
                        @keydown.space.prevent="openEntry(one)"
                    >
                        <td class="c-date">{{ shortDate(one.date) }}</td>
                        <td>{{ one.category }}</td>
                        <td class="c-note" :title="one.note">{{ one.note }}</td>
                        <td class="c-who" :class="{ idle: !one.characterId }">
                            {{ characterName(roster, one.characterId) }}
                        </td>
                        <td class="c-channel">{{ one.channel }}</td>
                        <td
                            class="c-num"
                            :class="{ out: one.kind === 'expense' }"
                            :title="CURRENCY_META[one.currency].label"
                        >
                            {{ one.kind === 'income' ? '+' : '−'
                            }}{{ amountText(one.amount, one.currency) }}
                        </td>
                    </tr>
                </tbody>
            </table>

            <footer v-if="recent.length" class="log-foot">
                <PressButton text="全部记录" label="打开全部账号记录" @click="recordsOpen = true" />
            </footer>
        </LedgerSection>

        <AccountEditor
            v-if="editing"
            :entry="editing.entry"
            :seed="editing.seed"
            @save="save"
            @close="editing = null"
        />

        <AccountRecords v-if="recordsOpen" @close="recordsOpen = false" @edit="openEntry" />
    </PageShell>
</template>

<style scoped>
.filters {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    margin-bottom: 16px;
}
.who-pick {
    flex: none;
    width: calc(148px * var(--fs-scale));
}
.range-text {
    margin-left: auto;
    color: var(--muted);
    font-size: var(--fs-xs);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.04em;
}

/* ---------- 两本账 ---------- */
/* 两块区块卡之间必须有 16：账号页的块是用 margin 堆的，不是 `gap` 容器，
 * 「快捷记账」下面原本直接贴着「最近记录」。卡抬起来之后，下面那张的顶边会压在
 * 上一张的落影里（实测：两条卡边几乎相接，读作一整块）。 */
.records {
    margin-top: 16px;
}

.books {
    /* 16 而不是 12：卡片现在是抬起来的，下沿 3px 断面 + 3px 硬影 + 10px 软影会探出卡外，
     * 12 时右边那张的落影压在左边那张的边上，两张卡读作「粘在一起」。 */
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
    margin-bottom: 16px;
}
.book {
    padding: 12px 14px;
}
.book-head {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 8px;
}
.book-head h2 {
    margin: 0;
}
.book-note,
.book-count {
    color: var(--muted);
    font-size: var(--fs-xs);
    letter-spacing: 0.06em;
}
.book-count {
    margin-left: auto;
}
.metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
}
.metrics > div {
    min-width: 0;
    padding-right: 9px;
}
.metrics > div + div {
    padding-left: 9px;
    border-left: var(--w-hair) solid var(--rule);
}
.cap {
    display: block;
    color: var(--muted);
    font-size: var(--fs-xs);
    letter-spacing: 0.08em;
}
/* 读数比 `--fs-amount` 低半档（1.28 而不是 1.4）。
 *
 * 这里一行要摆三格、每格只有卡片的三分之一，而梦幻币的读数是「−120 万」六个字。
 * 用 `--fs-amount`（18.9px）时实测 `−120 万` 要 74px、格子只有 72——多出的 2px
 * 正好把字截成省略号。降到 1.28（17.3px）后余 5px，1.1 字号档下也放得下。
 *
 * 不改成去空格的紧凑写法（`−120万`）：那个空格是全站表格对齐用的，明细表里
 * `4.6 万` 比 `4.6万` 好读。窄的是这一格，改这一格，不改全站口径。 */
.metrics b {
    display: block;
    overflow: hidden;
    margin-top: 1px;
    font-size: calc(var(--fs-base) * 1.28);
    font-weight: 400;
    line-height: 1.3;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-variant-numeric: tabular-nums;
}
.in {
    color: var(--num);
}
.out {
    color: var(--cinnabar);
}

/* ---------- 快捷记账 ---------- */
.shortcuts {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 8px;
}
.shortcut {
    display: block;
    padding: 0;
    border: 0;
    background: none;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
}
.shortcut:focus-visible {
    outline: var(--ring);
    outline-offset: var(--ring-offset);
    border-radius: var(--r-2);
}
/* 块面与速记格、装备块同一做法：`--paper-2` 比卡片纸暗一档 + 棱 + 落影。
 * 落影 0.55——十一块并排，按 1 浮起 3px 会读成一地碎纸。 */
.sc-tile {
    --tile-w: 100%;
    --tile-h: auto;
    --tile-r: var(--r-2);
    --tile-drop: 0.55;
    --tile-face: var(--paper-2);
    --tile-face-hover: var(--paper);
    box-sizing: border-box;
    padding: 8px 10px 9px;
}
/* 三行左对齐：图标行 / 标题 / 副标题。
 * `PressTile` 的 `.press-content` 默认居中，这里必须铺满并按左缘排——
 * 十一块并排时，左缘对齐的那一列字才读得出「一排入口」。 */
.sc-tile :deep(.press-content) {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    width: 100%;
}
.sc-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    /* 17 而不是默认的 14：这七枚图标是「认东西」用的（装备 / 召唤兽 / 点卡 / 游戏币），
     * 14px 在 150 宽的块里读不出轮廓，而它们正是这一块存在的理由。 */
    --icon-size: calc(17px * var(--fs-scale));
}
/* 方向徽标：一个字 + 一圈极淡的框。不做成实心块——十一块各带一枚实心徽标，
 * 整片会读成一排按钮而不是一排入口。`opacity` 再压一点，让它退到图标之后：
 * 这一块的主语是「买入装备」，不是「这是个支出」。 */
.sc-kind {
    padding: 0 4px;
    border: var(--w-hair) solid currentColor;
    border-radius: 3px;
    font-size: var(--fs-mini);
    line-height: 1.35;
    opacity: 0.72;
}
.sc-kind.income {
    color: var(--num);
}
.sc-kind.expense {
    color: var(--cinnabar);
}
.sc-title {
    color: var(--ink);
    font-size: var(--fs-sm);
    line-height: 1.35;
}
.sc-hint {
    overflow: hidden;
    width: 100%;
    color: var(--muted);
    font-size: var(--fs-mini);
    line-height: 1.3;
    white-space: nowrap;
    text-overflow: ellipsis;
}

/* ---------- 最近记录 ---------- */
.recent-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--fs-sm);
}
.recent-table thead th {
    padding: 4px 6px;
    border-bottom: var(--w-hair) solid var(--rule-2);
    color: var(--muted);
    font-size: var(--fs-mini);
    font-weight: 400;
    letter-spacing: 0.08em;
    text-align: left;
    white-space: nowrap;
}
.recent-table tbody td {
    padding: 7px 6px;
    border-bottom: var(--w-hair) solid var(--rule);
    vertical-align: middle;
}
/* 末行不画底线：它下面紧跟着页脚，两条线会在 16px 内并成一道双线。 */
.recent-table tbody tr:last-child td {
    border-bottom: 0;
}
.row {
    cursor: pointer;
}
.row:hover td {
    background: color-mix(in srgb, var(--paper-2) 70%, transparent);
}
.row:focus-visible {
    outline: var(--ring);
    outline-offset: calc(var(--ring-offset) * -1);
}
.c-date {
    width: 58px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
.c-note {
    /* 说明占剩余宽度并在过长时截断：它是唯一长度不可控的一列，定宽会让长备注撑破表格。 */
    overflow: hidden;
    max-width: 0;
    color: var(--muted);
    text-overflow: ellipsis;
    white-space: nowrap;
}
.c-who {
    width: 96px;
    white-space: nowrap;
}
.c-who.idle {
    color: var(--muted);
}
.c-channel {
    width: 84px;
    color: var(--muted);
    white-space: nowrap;
}
/* 金额列右对齐 + 等宽数字：这一列是给人比大小的，左对齐的 `4.6` 与 `12.5` 竖着对不齐。 */
.c-num {
    width: 116px;
    color: var(--num);
    text-align: right;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
}
.c-num.out {
    color: var(--cinnabar);
}

.log-foot {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 10px;
    padding-top: 10px;
    border-top: var(--w-hair) solid var(--rule);
}
.blank {
    margin: 20px 0;
    text-align: center;
}
</style>
