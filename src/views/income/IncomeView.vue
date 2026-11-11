<script setup lang="ts">
import SaveNotice from '../../components/SaveNotice.vue';
import { useToday } from '../../composables/use-today';
import { computed, ref } from 'vue';
import PageShell from '../../components/PageShell.vue';
import PressButton from '../../components/PressButton.vue';
import StatStrip, { type StatItem } from '../../components/StatStrip.vue';
import SteppedSlider from '../../components/SteppedSlider.vue';
import { saved } from '../../composables/save-feedback';
import { notify } from '../../composables/use-notify';
import type { QuickItemEntry } from '../../services/game-data';
import { toWan } from '../../services/format';
import {
    amountText,
    entriesIn,
    factsOf,
    previousWindowOf,
    recordSummary,
    statRowsOf,
    totalsOf,
    windowOf,
    type IncomeRange,
} from './income';
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
const {
    entries,
    loadError,
    writeError,
    recordEntry,
    setPrice,
    clearPrice,
    prices,
    pending,
    flush,
    retry,
} = useIncome();

type Range = IncomeRange;
const range = ref<Range>('day');
/* 显式标成可变数组：`SegmentedPills` 的 `options` 是可变类型，`as const` 出来的
 * readonly 元组赋不过去（它只读、但接收方声明的是可写）。 */
const RANGES: { value: Range; label: string }[] = [
    { value: 'day', label: '今天' },
    { value: 'week', label: '近七天' },
    { value: 'month', label: '本月' },
];

const today = useToday();

/**
 * 选中范围内的记录。
 *
 * 窗口定义搬到了 `income.ts`（`windowOf`）：统计条要显示「较上一档」，而上一档是同范围
 * 往前推一段——两处各写一次边界，「近七天」到底含不含今天就会有两种答案。
 */
const scoped = computed(() => entriesIn(entries.value, windowOf(range.value, today.value)));

/**
 * 上一档的合计，只用来算 `delta`。
 *
 * 窗口里一条记录都没有时 `totalsOf` 给全 0，`ratioText` 会把它落成「—」——
 * 那是「没有基数」，不是「上次是 0，这次暴涨」。
 */
const previousTotals = computed(() =>
    totalsOf(entriesIn(entries.value, previousWindowOf(range.value, today.value))),
);

const totals = computed(() => totalsOf(scoped.value));

/**
 * 统计条的四格。
 *
 * 2026-11-05 抽成 `StatStrip` 组件（总览页要用同一组数）：口径仍在这里与 `income.ts`，
 * 组件只负责摆——两页给出的数必须一模一样，所以连副文的写法都不能各写一份。
 * 2026-11-05 二次改版：四格改成压印签，每格多一行副文（构成 + 较上一档），
 * 拼装逻辑收进 `income.ts` 的 `statRowsOf`，这一层只调它。
 */
const statItems = computed<StatItem[]>(() =>
    statRowsOf(totals.value, previousTotals.value, factsOf(scoped.value)),
);

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
async function priceSaved(amount: number) {
    const ask = priceAsk.value;
    priceAsk.value = null;
    if (!ask) return;

    if (ask.mode === 'fixed') {
        setPrice(ask.item.id, toWan(amount));
        if (!ask.thenAdd) {
            if (await saved(flush))
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
    if (await saved(flush)) notify.success(recordSummary(ask.item.name, result.entries));
}

/**
 * 清除一件物品的单价（改价窗里的「清除」）。
 *
 * 有这条出口，是因为行情会停售、物品会卖光：留着一个旧价，下次点它就是按几个月前
 * 的价入账，而这种错在账面上看不出来——它只是「这次卖少了」。清成「未设价」之后，
 * 再点会先让你定价，代价是一次弹窗，换来的是不会默默记错。
 */
async function priceCleared() {
    const ask = priceAsk.value;
    priceAsk.value = null;
    if (!ask) return;
    clearPrice(ask.item.id);
    if (await saved(flush)) notify.success(`「${ask.item.name}」的单价已清除，下次点它要先定价`);
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
        <p v-if="loadError" class="note error">{{ loadError }}</p>
        <SaveNotice :error="writeError" :pending="pending" @retry="retry" />

        <div class="income-stack">
            <!-- 这一行只剩范围滑块。原先滑块右边还有一句「今天 · 0 笔」——2026-11-05
                 用户让删掉：范围的名字已经写在滑块上（当前那格就是亮的），条数在下面
                 四格统计里也有（第一格的「N 笔 · 均 X」），这句话只是把同一件事说了第三遍。 -->
            <div class="filters">
                <SteppedSlider
                    v-model="range"
                    :options="RANGES"
                    label="统计范围"
                    class="range-slider"
                />
            </div>

            <StatStrip :items="statItems" />

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
    /* 16 而不是 12：两张卡现在是**抬起来**的，下沿 3px 断面 + 3px 硬影 + 10px 软影会探出
     * 卡外一圈。间距留在 12 时，下面那张卡的顶边就压在上一张的影子里，读作「两张粘在一起」。
     * 统计签与速记之间的那一段同理——签也有自己的落影。 */
    gap: 16px;
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

/* ---------- 收益页的纸：这一页先不上渐变（2026-11-11 用户「收益页面的卡片的渐变背景去掉吧，
 * 我看下 去掉的效果如何」） ----------
 *
 * 只在这三块底下的卡上关掉 `background-image`（两张光：左上偏光 + 135° 斜差），
 * **不动全局 `.board`**——那句话只针对收益页，别处（角色卡、物价卡）现在看着没问题，
 * 一起关掉是替用户做了他没要求的决定。若这一版留用，再把 `.board` 那两层渐变整段删掉，
 * 并同步 `base.css` 里"纸是斜着受光的平面"那段注释。
 *
 * 底色、棱、3px 断面与两层落影都留着：它们才是"纸"的形，渐变只是"光"。关掉之后卡面是
 * 一块匀色纸，与台面仍分得清。
 *
 * **类名写两遍**（`.income-stack.income-stack`）是为了抬特异性：`base.css` 里
 * `:root.dark .board` 是 (0,3,0)，而 scoped 这条不带重复时只有 `.income-stack[data-v-…] .board`
 * = (0,3,0)（一个属性选择器也算一级），打平后靠注入顺序——全局表先注入，暗色主题下渐变就回来了。
 * 写两遍拼成 (0,4,0)，亮暗两边一次压住，不必再给暗色单写一条。
 * （`:global(html.dark) …` 那条试过不通：SFC 编译器只保留括号里第一段，拼出来是
 * `html.dark { background-image: none }`，会把**所有**元素的背景图清掉。） */
.income-stack.income-stack :deep(.board) {
    background-image: none;
}

/* 统计条已抽成 `components/StatStrip.vue`（总览页共用同一块）。
 * 原来这里的 `.stats-card` / `.stats` / `.cap` / `.v` / `.num` / `.loss` 一并搬走——
 * 留在 scoped 里就是一份没人用的死样式，而且它们会与组件内的同名类**合并生效**
 * （scoped 只加属性选择器，拦不住同名规则，§2.4-45），改一处、另一处不动就会对不上。 */

/* 两栏：左边速记吃满剩余，右边清单定宽。`stretch` 让两张卡的底边齐平——
 * 用 `start` 时右下会空出一块，读作「右边那张没画完」。 */
.split {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    gap: 16px;
    align-items: stretch;
}
</style>
