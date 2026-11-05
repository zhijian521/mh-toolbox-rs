<script setup lang="ts">
import { computed, ref } from 'vue';
import PageShell from '../../components/PageShell.vue';
import PressButton from '../../components/PressButton.vue';
import SteppedSlider from '../../components/SteppedSlider.vue';
import { notify } from '../../composables/use-notify';
import type { QuickItemEntry } from '../../services/game-data';
import { daysAgo, toWan, todayText } from '../../services/format';
import { amountText, entriesOn, recordSummary, totalsOf } from './income';
import { useIncome } from './income-store';
import IncomeHistoryDialog from './IncomeHistoryDialog.vue';
import ItemPriceDialog from './ItemPriceDialog.vue';
import QuickPanel from './QuickPanel.vue';
import TodayDump from './TodayDump.vue';

/**
 * 收益页：**速记是入口**，不是「记一笔」按钮。
 *
 * 版面（第 97 批定的「速记台」）：
 *   统计四格 → 左「物品速记」/ 右「今日速记」。
 * 左边点一下记一条，右边立刻多一行——那一列同时是回执与后悔药。
 *
 * ---- 为什么统计要能切范围 ----
 * 速记只看今天，但「今天赚了多少」这个数没有参照：切到本周/本月才知道这几天的节奏。
 * 切换只在前端筛（数据本来就全在内存里），不发请求、不改速记的日期口径。
 *
 * ---- 这一层只留界面状态 ----
 * 记录与单价在 `useIncome()`（模块级单例），规则在 `income.ts`。这里只有四样：
 * 统计范围、单价窗开着谁、窗里要预填的现值（`prices`），以及「刚才为什么没写进去」
 * （那两条来自 store）。换算、筛选、合计全在 `income.ts`——那些函数要能单测。
 */
const { entries, loadError, writeError, recordEntry, setPrice, clearPrice, prices } = useIncome();

type Range = 'day' | 'week' | 'month';
const range = ref<Range>('day');
/* 显式标成可变数组：`SegmentedPills` 的 `options` 是可变类型，`as const` 出来的
 * readonly 元组赋不过去（它只读、但接收方声明的是可写）。 */
const RANGES: { value: Range; label: string }[] = [
    { value: 'day', label: '今天' },
    { value: 'week', label: '近七天' },
    { value: 'month', label: '本月' },
];

/** 当前范围的说法。从 `RANGES` 里取，不另写一份表——两张表迟早会有一张忘了改。 */
const rangeWord = computed(() => RANGES.find((one) => one.value === range.value)?.label ?? '今天');

/**
 * 选中范围内的记录。
 *
 * 「本周」取**近七天**而不是「周一到今天」：这一页记的是「这几天赚了多少」，
 * 周一切换会把周日那天从账上抹掉，读起来像丢了一笔。
 */
const scoped = computed(() => {
    const all = entries.value;
    const now = todayText();
    if (range.value === 'day') return entriesOn(all, now);
    if (range.value === 'week') {
        const from = daysAgo(6);
        return all.filter((one) => one.date >= from && one.date <= now);
    }
    const month = now.slice(0, 7);
    return all.filter((one) => one.date.startsWith(month));
});

const totals = computed(() => totalsOf(scoped.value));

/* ---------- 单价窗 ---------- */
interface PriceAsk {
    item: QuickItemEntry;
    mode: 'fixed' | 'variable';
    thenAdd: boolean;
}
const priceAsk = ref<PriceAsk | null>(null);

/**
 * 历史收益浮层开着没有。
 *
 * 状态放在页面上而不是组件里：`ModalShell` 一挂载就会抢焦点、锁滚动，
 * 用一个 `v-if` 而不是「组件自己藏起来」才对得上（`ItemPriceDialog` 同一条）。
 */
const historyOpen = ref(false);

function askPrice(item: QuickItemEntry, mode: 'fixed' | 'variable', thenAdd: boolean) {
    priceAsk.value = { item, mode, thenAdd };
}

/**
 * 单价填完了。
 *
 * `mode === 'fixed'` 才写回单价表：浮动价每条的价都不同，写回去等于让下一条默认用
 * 昨天的价——那比空着更容易记错。
 */
function priceSaved(amount: number) {
    const ask = priceAsk.value;
    priceAsk.value = null;
    if (!ask) return;

    if (ask.mode === 'fixed') {
        setPrice(ask.item.id, toWan(amount));
        if (!ask.thenAdd) {
            notify.success(`「${ask.item.name}」的单价已记为 ${amountText(amount)}`);
            return;
        }
    }
    if (!ask.thenAdd) return;

    const result = recordEntry({ item: ask.item.name, amount });
    if (!result.ok) {
        notify.error(result.error);
        return;
    }
    notify.success(recordSummary(ask.item.name, result.entries));
}

/**
 * 清除一件物品的单价（改价窗里的「清除」）。
 *
 * 有这条出口，是因为行情会停售、物品会卖光：留着一个旧价，下次点它就是按几个月前
 * 的价入账，而这种错在账面上看不出来——它只是「这次卖少了」。清成「未设价」之后，
 * 再点会先让你定价，代价是一次弹窗，换来的是不会默默记错。
 */
function priceCleared() {
    const ask = priceAsk.value;
    priceAsk.value = null;
    if (!ask) return;
    clearPrice(ask.item.id);
    notify.success(`「${ask.item.name}」的单价已清除，下次点它要先定价`);
}
</script>

<template>
    <PageShell title="收益" desc="物品速记 · 按天分账">
        <!-- 页头最右：翻历史是本页唯一的「离开当前一天」的入口，放在标题行右侧，
             与左栏速记、右栏今日清单都隔开一段。`md` 档（26）是页头的硬约束，
             见 `PageHeader.vue` 第 6 条——`lg` 会把页头顶高、底下那道通栏账线跟着错位。 -->
        <template #actions>
            <PressButton
                icon="history"
                text="历史"
                label="查看历史收益，按角色与按天"
                @click="historyOpen = true"
            />
        </template>

        <!-- 数据层那两条红字合成一行：`loadError`（整份读不出）优先于 `writeError`
             （刚那一笔没写进去）。两条同时成立时上下叠两行，与角色页、物价页的写法不同，
             而且用户在同一屏里读到两句几乎同义的话只会更慌。 -->
        <p v-if="loadError || writeError" class="note error">{{ loadError || writeError }}</p>

        <div class="income-stack">
            <div class="filters">
                <SteppedSlider
                    v-model="range"
                    :options="RANGES"
                    label="统计范围"
                    class="range-slider"
                />
                <span class="meta">{{ rangeWord }} · {{ totals.count }} 笔</span>
            </div>

            <section class="frame stats-card">
                <div class="stats">
                    <div>
                        <div class="cap">收入</div>
                        <div class="v num">{{ amountText(totals.income) }}</div>
                    </div>
                    <div>
                        <div class="cap">支出</div>
                        <div class="v" :class="totals.expense ? 'loss' : 'num'">
                            {{ totals.expense ? `−${amountText(totals.expense)}` : '—' }}
                        </div>
                    </div>
                    <div>
                        <div class="cap">净额</div>
                        <!-- 负数必须带符号：左边「支出」有 `−`，净额只在颜色上转朱时，
                             一个「15 万」会被读成「今天赚了 15 万」——正是这一栏最不能错的地方。 -->
                        <div class="v" :class="totals.net < 0 ? 'loss' : 'num'">
                            {{
                                totals.net < 0
                                    ? `−${amountText(-totals.net)}`
                                    : amountText(totals.net)
                            }}
                        </div>
                    </div>
                    <div>
                        <div class="cap">笔数</div>
                        <div class="v num">{{ totals.count }}</div>
                    </div>
                </div>
            </section>

            <div class="split">
                <QuickPanel @need-price="askPrice" />
                <TodayDump />
            </div>
        </div>

        <ItemPriceDialog
            v-if="priceAsk"
            :item="priceAsk.item"
            :mode="priceAsk.mode"
            :then-add="priceAsk.thenAdd"
            :current="prices[priceAsk.item.id] ?? 0"
            @save="priceSaved"
            @clear="priceCleared"
            @close="priceAsk = null"
        />

        <IncomeHistoryDialog v-if="historyOpen" @close="historyOpen = false" />
    </PageShell>
</template>

<style scoped>
/* 三块（筛选行 / 统计条 / 速记两栏）之间统一 12px。
 *
 * 2026-11-04 用户：「统计卡片和下面物品速记中间没有间距」。此前只有 `.filters` 自己写了
 * `margin-bottom`，统计条与速记之间是 0——两张纸的边直接叠在一起，读起来像一张画歪的卡。
 * 改成外层一根 `gap` 之后，**间距不再由「每块记得给自己加下边距」保证**：以后再加一块，
 * 不写样式也是 12。
 *
 * **不能叫 `.stack`**：`blocks.css` 里已经有一个全局 `.stack`（设置页与开发页那「一列卡」），
 * 它带 `max-width: 1240px`——那一条是给说明文字页写的，理由是「再宽只会让说明拖成一条长线」。
 * 这一页是数据页，59 个格子越多列越好，窗口放大到 1500 以上时右侧就被这条上限留出近 300 的
 * 空白（用户实测：「屏幕放大的时候右侧有空白，没有撑满」）。scoped 只加属性选择器，
 * **拦不住同名的全局规则**——两个 `.stack` 会合并生效，这才是那次空白的真因。
 * 换个自有的名字，两边的意图各归各的。 */
.income-stack {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.filters {
    display: flex;
    align-items: center;
    gap: 10px;
}
/* 三档滑块自己只画到内容宽，宽度由调用方给：写死 264 让「近七天」三个字两侧留白相同
 * （`inline-grid` 等分三格，格宽一致，字短的那格不会被挤）。 */
/* 三格各 72：最长的「近七天」在 13.5px 下约 41 宽，两侧各留 15 的余量。
 * 原先是 264（各 86），一条滑块比旁边的统计数还抢眼——它是过滤器，不是主角。 */
.range-slider {
    width: 216px;
}

/* 统计条：四格一条线分开，读作一行账，不是四张卡。 */
.stats-card {
    padding: 12px 18px;
}
.stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
}
.stats > div {
    min-width: 0;
    padding-right: 16px;
}
.stats > div + div {
    padding-left: 16px;
    border-left: var(--w-hair) solid var(--rule);
}
.cap {
    color: var(--muted);
    font-size: var(--fs-xs);
    letter-spacing: 0.08em;
}
.v {
    margin-top: 1px;
    overflow: hidden;
    font-size: var(--fs-amount);
    line-height: 1.3;
    white-space: nowrap;
    text-overflow: ellipsis;
}
.num {
    color: var(--num);
}
/* 支出与净额为负时转朱：与卡上的三层（墨名目 / 赭读数 / 朱强调）同一条。 */
.loss {
    color: var(--cinnabar);
}

/* 两栏：左边速记吃满剩余，右边清单定宽。`stretch` 让两张卡的底边齐平——
 * 用 `start` 时右下会空出一块，读作「右边那张没画完」。 */
.split {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    gap: 12px;
    align-items: stretch;
}
</style>
