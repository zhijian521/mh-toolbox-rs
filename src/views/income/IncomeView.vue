<script setup lang="ts">
import SaveNotice from '../../components/SaveNotice.vue';
import { useToday } from '../../composables/use-today';
import { computed, ref } from 'vue';
import PageShell from '../../components/PageShell.vue';
import PressButton from '../../components/PressButton.vue';
import StatStrip, { type StatItem } from '../../components/StatStrip.vue';
import { saved } from '../../composables/save-feedback';
import { notify } from '../../composables/use-notify';
import type { QuickItemEntry } from '../../services/game-data';
import { daysAgo, parseDay, toWan } from '../../services/format';
import { amountText, entriesOn, factsOf, recordSummary, statRowsOf, totalsOf } from './income';
import { useIncome } from './income-store';
import IncomeHistoryDialog from './IncomeHistoryDialog.vue';
import ItemPriceDialog from './ItemPriceDialog.vue';
import OnlineBar from './OnlineBar.vue';
import OnlineDialog from './OnlineDialog.vue';
import OnlinePanel from './OnlinePanel.vue';
import OnlineRecords from './OnlineRecords.vue';
import QuickPanel from './QuickPanel.vue';
import TodayDump from './TodayDump.vue';
import { type OnlineSession } from './online';
import { useOnline } from './online-store';

/**
 * 收益页：**速记是入口**，不是「记一笔」按钮。
 *
 * 版面（第 97 批定的「速记台」）：
 *   统计四格 → 状态条 → 左「物品速记」/ 右「今日速记」→ 每日走势（两张折线）。
 * 左边点一下记一条，右边立刻多一行——那一列同时是回执与后悔药。
 *
 * 状态条（`OnlineBar`，2026-11-11 加）夹在统计与速记之间，是这一页唯一说「此刻」的地方：
 * 上面四格是「这一段合了多少」（过去），下面两栏是「一条一条记」（刚发生），
 * 中间那条是可操作的现在——点卡记不记、哪些号还挂着、怎么停。
 *
 * ---- 为什么统计只算今天 ----
 * 2026-11-11 用户：「今日 / 近七天 / 本月 删除，我们收益只记录本天的记录」。
 * 这条要求把整页的口径收成一天：速记本来就只写今天（`recordEntry` 的日期恒为
 * `todayText()`），统计也就没有「别的一段」可选。范围滑块的另一层代价是**它与速记的
 * 日期口径不一致**——上面写着「本月 1234 万」，下面点一下只进今天那条，两个数不在同一段时间里。
 * 要看别天、别段，走页头「历史」（起止区间 + 角色筛选 + 可改可删的流水）。
 *
 * 于是「今天赚了多少」的参照退回到**昨天**：与总览页同一句话（`statRowsOf` 的第四列），
 * 两页给出的说法一致，不必学第二套。
 *
 * ---- 这一层只留界面状态 ----
 * 记录与单价在 `useIncome()`（模块级单例），规则在 `income.ts`。收益这本账的界面状态只有三样：
 * 单价窗开着谁、窗里要预填的现值（`prices`），以及「刚才为什么没写进去」（那两条来自 store）。
 * 另外三样是别的区块自己的开合（历史窗、上线窗、记录窗），见下面各自那一段。
 * 换算、筛选、合计全在 `income.ts`——那些函数要能单测。
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

const today = useToday();

/**
 * 今天的记录。
 *
 * 筛的是**日期**而不是 `createdAt`：账按日分，而「今天」是本地时区的一天
 * （`todayText` 的口径）。跨午夜时 `useToday` 会自己推进一步，这一屏跟着换新的一天。
 */
const scoped = computed(() => entriesOn(entries.value, today.value));

/**
 * 昨天的合计，只用来算 `delta`。
 *
 * 昨天一条记录都没有时 `totalsOf` 给全 0，`ratioText` 会把它落成「—」——
 * 那是「没有基数」，不是「上次是 0，这次暴涨」。
 *
 * 从 `today` 推而不是直接 `daysAgo(1)`：两次各取一次「现在」，跨午夜时会出现
 * 「今天的数配昨天的前一天」（总览页同一条写法）。
 */
const previousTotals = computed(() =>
    totalsOf(entriesOn(entries.value, daysAgo(1, parseDay(today.value)))),
);

const totals = computed(() => totalsOf(scoped.value));

/**
 * 统计条的四格。
 *
 * 2026-11-05 抽成 `StatStrip` 组件（总览页要用同一组数）：口径仍在这里与 `income.ts`，
 * 组件只负责摆——两页给出的数必须一模一样，所以连副文的写法都不能各写一份。
 * 2026-11-05 二次改版：四格改成压印签，每格多一行副文（构成 + 较上一档），
 * 拼装逻辑收进 `income.ts` 的 `statRowsOf`，这一层只调它。
 * 2026-11-11 起「上一档」恒为昨天：这一页只算今天，比较的对象只有昨天。
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

/* ---------- 上线计时 ---------- */

/**
 * 上线计时：入口、窗、以及「全停」。
 *
 * 「上线」**一直在**（可以随时再加号），「结束」只在有人计时时多露出来一枚。
 * 曾经这两枚共用一个位置、互斥显示，于是「先开两个号、过一会儿再开两个」没法做——
 * 一有人在计时，「上线」就消失，而那正是最常用的顺序。
 */
const { sessions, stopOnline, flush: flushOnline } = useOnline();

const running = computed(() => sessions.value.filter((one) => one.endAt === null));

const onlineDialog = ref<'start' | 'backfill' | 'edit' | null>(null);
const editTarget = ref<OnlineSession | null>(null);
const recordsOpen = ref(false);

/* 从「记录」窗里点开某一段时先把那扇窗关掉：两扇 ModalShell 同时开着，
 * 后开的那扇在焦点链与 Esc 上都压着前一扇，关掉上面这扇就会露出下面那扇的旧位置。 */
function editOnline(one: OnlineSession) {
    recordsOpen.value = false;
    editTarget.value = one;
    onlineDialog.value = 'edit';
}

function closeOnlineDialog() {
    onlineDialog.value = null;
    editTarget.value = null;
}

/** 结束计时。不足一分钟的段由 store 丢掉（误点两次不该留下 0 分钟记录）。 */
async function finishOnline() {
    const result = stopOnline();
    if (!result.ok) {
        notify.error(result.error);
        return;
    }
    if (await saved(flushOnline)) notify.success('已结束计时');
}

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
            <!-- 2026-11-11 用户要求把「历史」与「上线」换位：翻历史偶尔才做一次，
                 上线/结束每天要做好几次，高频的那个放在最右手（拇指最先够到的那侧）。
                 翻历史不再占据最右，它退到左边一枚朴素按钮。 -->
            <PressButton
                icon="history"
                text="历史"
                label="查看历史收益，按角色与按天"
                @click="historyOpen = true"
            />
            <!-- 「结束」只在有人在计时时出现，而且**不再顶掉「上线」**。
                 2026-11-11 用户报：先开两个号，想再开两个号，发现无从下手——
                 原来这两枚是同一位置的互斥状态，一有人在计时，「上线」就消失了。
                 而真实用法恰恰是「先上两个，过一会儿再上两个」，上线必须一直在。
                 按钮上只写「结束」：它是全停，但「全部」和人数留着会把按钮撑宽、
                 也和下面状态条里逐个结束的胶囊读起来像两件事。谁在线、有几个，
                 状态条紧挨着下方，扫一眼就在。素色朴素按钮，别与朱印抢眼。
                 读屏仍念全「结束全部计时（N 个号在线）」——看不见的那层要说清后果。 -->
            <PressButton
                v-if="running.length"
                icon="stop"
                text="结束"
                :label="`结束全部计时（${running.length} 个号在线）`"
                @click="finishOnline"
            />
            <!-- 朱印只给「上线」这一枚：它是这一屏每天点得最多的动作。
                 换个号、加一个号都从这里进，选完号各自独立计时。 -->
            <PressButton
                icon="play"
                text="上线"
                label="开始计时（可以随时再加号）"
                seal
                @click="onlineDialog = 'start'"
            />
        </template>

        <!-- 数据层那两条红字合成一行：`loadError`（整份读不出）优先于 `writeError`
             （刚那一笔没写进去）。两条同时成立时上下叠两行，与角色页、物价页的写法不同，
             而且用户在同一屏里读到两句几乎同义的话只会更慌。 -->
        <p v-if="loadError" class="note error">{{ loadError }}</p>
        <SaveNotice :error="writeError" :pending="pending" @retry="retry" />

        <div class="income-stack">
            <!-- 范围滑块删掉之后这一块从统计条直起（2026-11-11 用户：「今日 / 近七天 /
                 本月 删除，我们收益只记录本天的记录」）。四格上面的第一行就是「收入」，
                 不再有一条只说「现在看的是哪天」的控件——它说的那件事由速记本身保证：
                 点一下就进今天。 -->
            <StatStrip :items="statItems" />

            <!-- 「此刻」那条：点卡口径与在线的号。夹在统计条与速记之间，
                 因为「上线 / 下线」这件事发生在记账之前，读完上一段的合计、
                 先看一眼谁还挂着，再去记这一条，顺序与真实的动作一致。 -->
            <OnlineBar />

            <div class="split">
                <QuickPanel @need-price="askPrice" />
                <TodayDump />
            </div>

            <OnlinePanel @records="recordsOpen = true" @backfill="onlineDialog = 'backfill'" />
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

        <!-- 三模式共用一张表单：字段是同一组的子集，拆成三个窗就有三份校验，
             而校验恰恰是必须只有一份的东西。 -->
        <OnlineDialog
            v-if="onlineDialog"
            :mode="onlineDialog"
            :session="editTarget ?? undefined"
            @close="closeOnlineDialog"
        />

        <OnlineRecords v-if="recordsOpen" @close="recordsOpen = false" @edit="editOnline" />
    </PageShell>
</template>

<style scoped>
/* 四块（统计条 / 状态条 / 速记两栏 / 每日走势）之间统一 16px。
 *
 * 2026-11-04 用户：「统计卡片和下面物品速记中间没有间距」。当时只有筛选行自己写了
 * `margin-bottom`，统计条与速记之间是 0——两张纸的边直接叠在一起，读起来像一张画歪的卡。
 * 改成外层一根 `gap` 之后，**间距不再由「每块记得给自己加下边距」保证**：以后再加一块，
 * 不写样式也有这一段。2026-11-11 那一行筛选（三档滑块）删掉之后，这一列从统计条起头。
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

/* 收益页使用匀色纸，关闭表面光照，保留纸面、棱和阴影。 */
.income-stack :deep(.board) {
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
