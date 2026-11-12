<script setup lang="ts">
import { computed, ref } from 'vue';
import AppIcon from '../../components/AppIcon.vue';
import CostSwitch from '../../components/CostSwitch.vue';
import PaperCard from '../../components/PaperCard.vue';
import { saved } from '../../composables/save-feedback';
import { notify } from '../../composables/use-notify';
import { useToday } from '../../composables/use-today';
import { moneyText, toWan } from '../../services/format';
import { characterName, useRoster } from '../characters/roster';
import CardPriceDialog from './CardPriceDialog.vue';
import {
    clockText,
    minutesText,
    onlineTotalsOf,
    ownersOf,
    sessionMinutes,
    type OnlineSession,
} from './online';
import { useOnline } from './online-store';

/**
 * 状态条：「此刻」的三件事 —— 点卡算不算、今天挂了多少、谁还在线怎么停。
 *
 * ---- 为什么从最下面那张走势卡里搬出来 ----
 * 2026-11-11 用户：「在统计卡片和物品速记中间多加个模块，专门用来（放）是否记录点卡，
 * 点卡加个当前在线角色和结束按钮」；随后又要求「今日在线 / 今日点卡 / 点卡单价也放到上面去」。
 * 这三格读数原来住在页面最下面那张卡里，而那张卡的主语是「这几天怎么走的」（两张走势图）。
 * 一条卡只回答一个问题：**这条回答「此刻」，那张回答「趋势」**。
 *
 * 位置在统计条与速记之间：上面四格是「这一段合了多少」（过去），这条是「我现在什么状态」，
 * 下面两栏是「一条一条记」（刚发生）。顺序与真实动作一致——上线、看一眼今天挂了多少、再记账。
 *
 * ---- 在线号的形状：一行胶囊，横向滚动 ----
 * 这一格改过三次，记下来免得再绕：① 一排扁签（无边框）→ ② 一人一行纵向滚 → ③ **现在这版**。
 *
 * 用户 2026-11-11 的两次原话：先「每个角色的在线状态和时间单独一行展示，超出内容左右滚动，
 * 后面的结束可以用图表 X 表示」（→ ②），再「角色单个的在线结束 **还修改为刚刚的胶囊样式**，
 * 一行展示，超出左右滚动」（→ ③）。
 *
 * 回到胶囊的理由是**高度**：一人一行在只有两三个号时也要占三行，而这条状态条本来就只有
 * 一行字高，它会被下面那张速记卡挤下去；一行胶囊在 2–4 个号时刚好铺满一条，绝大多数时候
 * 不需要滚。号多到放不下时**横向**滚——滚动方向与排列方向一致，滚的是「后面还有几个号」，
 * 不会像纵向那样把「今天挂了多少」那三格读数顶走。代价说清楚：超过四五个号时，
 * 最右边那个要横着滚一下才看得见。
 *
 * ---- 为什么整枚胶囊可点，而不是里面单放一枚 × ----
 * 胶囊本身是一个「这个号正在跑」的对象，点它就是「停这个号」——目标越大越不容易点错旁边那个。
 * 为免读不出来，`title` 与 `aria-label` 都写着「结束 X 的计时」；行尾那枚 × 只是**可点的
 * 提示**（所以它是 `span` 而不是 `button`：按钮里套按钮，读屏会念出两个动作）。
 * 尺寸仍走 `--icon-size`，与全站图标同一档缩放。
 *
 * ---- 点卡开关左右都得说清楚 ----
 * 关掉之后计时照记、只是不折进账号收支。只写「不计」会被读成「不计时」，
 * 而这一条正是「我这一晚上到底烧不烧点卡」的唯一开关，读错的代价是账上多出一笔假成本。
 */
const { sessions, settings, setCardCost, setCardPrice, stopOnline, flush } = useOnline();
const { roster } = useRoster();
const today = useToday();

const running = computed(() => sessions.value.filter((one) => one.endAt === null));

const totals = computed(() => onlineTotalsOf(sessions.value, today.value, today.value));

async function toggleCost(on: boolean) {
    const result = setCardCost(on);
    if (!result.ok) {
        notify.error(result.error);
        return;
    }
    if (await saved(flush)) {
        notify.success(on ? '之后的上线会记进账号收支' : '之后的上线不再记进账号收支');
    }
}

/**
 * 单价窗。开着没有由这里管，字段与校验在 `CardPriceDialog` 里。
 *
 * 2026-11-11 用户：「点卡价格也使用类似于 tag 的样式放到计入不计入的前面，然后点击价格
 * 弹出小窗修改价格，类似于我们的物品快速记录的」。之前它是状态条上的一格输入槽——
 * 一设定就几天不动的数，却占着这一行最长的一格，把三个读数挤到左边。
 */
const priceOpen = ref(false);

/** 保存点卡单价。输入是原值（与库里同一个口径），落库前换成「万」。 */
async function savePrice(amount: number) {
    const result = setCardPrice(toWan(amount));
    if (!result.ok) {
        notify.error(result.error);
        return;
    }
    priceOpen.value = false;
    if (await saved(flush)) notify.success(`点卡按 ${moneyText(amount)}/点 计`);
}

/** 单独结束一个号的计时。页头那枚「结束」是一次全停，这里只停一个。 */
async function stopOne(one: OnlineSession) {
    const result = stopOnline([one.characterId]);
    if (!result.ok) {
        notify.error(result.error);
        return;
    }
    if (await saved(flush)) notify.success(`${whoText(one)} 的计时已结束`);
}

function whoText(one: OnlineSession): string {
    const names = ownersOf(one).map((id) => characterName(roster.value, id));
    return names.length ? names.join('、') : '未指定';
}
</script>

<template>
    <PaperCard as="div" class="online-bar">
        <div class="head">
            <!-- 单价排在最前、在开关之前（用户 2026-11-11：「点卡价格也使用类似于 tag 的样式
                 放到计入不计入的前面」）。顺序上是「按多少算 → 算不算 → 今天烧了多少」，
                 正好是这一行从左往右的因果链。

                 它是一枚**可点的签**：与旁边两枚读数同族（发丝边 + 满圆角 + --fs-sm），
                 但整枚是 button、带悬停——形状一样，能不能点靠悬停与读屏分开说。 -->
            <button
                type="button"
                class="readout tag price-tag"
                :title="`点卡单价 ${moneyText(settings.cardPrice)}/点，点一下改`"
                :aria-label="`点卡单价 ${moneyText(settings.cardPrice)}/点，点一下改`"
                @click="priceOpen = true"
            >
                <span class="cap">单价</span>
                <span class="val">{{ moneyText(settings.cardPrice) }}</span>
                <AppIcon name="edit" class="mark" />
            </button>

            <div class="cell">
                <CostSwitch
                    :model-value="settings.cardCost"
                    off-label="不计"
                    on-label="计入"
                    label="点卡计入账号收支"
                    @update:model-value="toggleCost"
                />
            </div>

            <!-- 两个合计做成 tag：与上面那枚单价签、下面那排在线胶囊同一族的形状。 -->
            <div class="readout tag">
                <span class="cap">今日在线</span>
                <span class="val">{{ totals.minutes ? minutesText(totals.minutes) : '—' }}</span>
            </div>

            <div class="readout tag">
                <span class="cap">今日点卡</span>
                <span class="val">{{ totals.cost > 0 ? moneyText(totals.cost) : '—' }}</span>
            </div>
        </div>

        <!-- 一行胶囊，排不下就横向滚（用户 2026-11-11：「还修改为刚刚的胶囊样式，
             一行展示，超出左右滚动」）。整枚胶囊是按钮，点它只停这一个号。 -->
        <div v-if="running.length" class="live-list">
            <button
                v-for="one in running"
                :key="one.id"
                type="button"
                class="live-chip"
                :title="`结束 ${whoText(one)} 的计时`"
                :aria-label="`结束 ${whoText(one)} 的计时`"
                @click="stopOne(one)"
            >
                <span class="dot" aria-hidden="true" />
                <span class="name">{{ whoText(one) }}</span>
                <span class="time">{{ clockText(sessionMinutes(one)) }}</span>
                <AppIcon name="close" class="mark" />
            </button>
        </div>
        <p v-else class="idle">现在没有号在计时 · 页头「上线」开始</p>

        <CardPriceDialog
            v-if="priceOpen"
            :current="settings.cardPrice"
            :card-cost="settings.cardCost"
            @save="savePrice"
            @close="priceOpen = false"
        />
    </PaperCard>
</template>

<style scoped>
/* 一条横向的纸：内衬比常规 .board 的 20 收窄到 10/14。这里是一行字加若干行签，
 * 20 会把一条状态条撑成一张小卡，与它「一条」的身份不符。 */
.online-bar {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 14px;
}

/* 读数那一行：从左往右是「按多少算 → 算不算 → 今天烧了多少」，
 * 顺序本身就是这一行的因果链，所以不给任何一格做右推。 */
.head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 22px;
}

.cell,
.readout {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
}

.cap {
    flex: none;
    color: var(--muted);
    font-size: var(--fs-xs);
    letter-spacing: 0.06em;
}

/* 读数的数：与正文字号齐平，靠 tabular-nums 对齐位数（两个合计并排时位数要能对上）。 */
.val {
    font-size: var(--fs-sm);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}

/* 两个合计的 tag：与下面那排在线胶囊**同一族**——同样的发丝边、同样的满圆角、
 * 同样的字号，只是不做悬停（它们不可点）。共用形状是有信息的：读的人不用猜
 * 「这枚能点吗」，凡是这种圆角发丝框的，要么是号、要么是号身上的数。
 *
 * 内衬比胶囊紧一点（1px 8px）：胶囊是按钮、要够得着，这枚是读数、贴着字就够。 */
.tag {
    gap: 6px;
    padding: 1px 8px;
    border: var(--w-hair) solid var(--rule-2);
    border-radius: var(--r-pill);
}

/* tag 里的标签比别处的 cap 更淡、更小一档：它已经在框里，不再需要靠字距撑出层级。 */
.tag .cap {
    font-size: var(--fs-mini);
    letter-spacing: 0.04em;
}
/* 单价那枚签是**可点的 tag**：形状与旁边两枚读数完全一致（都走 .tag），
 * 只多三样——button 的重置、悬停、行尾一支铅笔。
 *
 * 重置是必须的：button 自带 buttonface 底色、内边与一套系统字体，不压掉的话
 * 三枚签并排会有一枚看起来像「凹陷的旧控件」。 */
.price-tag {
    background: none;
    color: var(--ink-2);
    font-family: var(--font-ui);
    font-size: var(--fs-sm);
    cursor: pointer;
    transition:
        border-color var(--t-quick) var(--ease-soft),
        background-color var(--t-quick) var(--ease-soft),
        color var(--t-quick) var(--ease-soft);
}

.price-tag:hover {
    border-color: color-mix(in srgb, var(--seal-edge) 55%, var(--rule-2));
    background-color: color-mix(in srgb, var(--seal) 8%, transparent);
    color: var(--ink);
}

.price-tag:focus-visible {
    outline: var(--ring);
    outline-offset: 1px;
}

/* 铅笔：说得出「这枚能改」。剩下的（尺寸/颜色/过渡）沿用下面那条 .mark——
 * 比 × 小一档，因为它是提示而不是动作。 */
.price-tag .mark {
    --icon-size: calc(10px * var(--fs-scale));
}

.price-tag:hover .mark {
    color: var(--accent);
}

/* 在线的号：**一行胶囊**，放不下就横向滚（用户 2026-11-11 的原话）。
 *
 * 只滚横向：排列方向与滚动方向一致，滚的是「后面还有几个号」；纵向滚会把上面那三格
 * 读数顶走。`overflow-y: hidden` 是必须的——只写 `overflow-x: auto` 时另一轴会被算成
 * `auto`，胶囊稍微一压就会多出一条竖向滚动条。
 *
 * 滚动条本身不想占这 10px 的高度：一根细条会把这行胶囊顶高，整条状态条跟着长一截。
 * 用「补下内衬 + 等量负外边距」把它压在卡的内衬里，高度与没滚动条时一致。 */
.live-list {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-bottom: var(--scrollbar-w);
    margin-bottom: calc(-1 * var(--scrollbar-w));
    overflow-x: auto;
    overflow-y: hidden;
}

/* 一枚胶囊 = 一个正在跑的号。整枚可点（点一下只停这一个），所以它是 `button`：
 * 目标越大越不容易点到旁边那个。边框与悬停照全局 `.chip-action` 那条（洇一点朱），
 * 只是圆角到满、内衬宽一档——它比静态的分类签高一级。 */
.live-chip {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 6px;
    padding: 2px 9px;
    border: var(--w-hair) solid var(--rule-2);
    border-radius: var(--r-pill);
    background: none;
    color: var(--ink-2);
    font-family: var(--font-ui);
    font-size: var(--fs-sm);
    white-space: nowrap;
    cursor: pointer;
    transition:
        border-color var(--t-quick) var(--ease-soft),
        background-color var(--t-quick) var(--ease-soft),
        color var(--t-quick) var(--ease-soft);
}

.live-chip:hover {
    border-color: color-mix(in srgb, var(--seal-edge) 55%, var(--rule-2));
    background-color: color-mix(in srgb, var(--seal) 8%, transparent);
    color: var(--ink);
}

.live-chip:focus-visible {
    outline: var(--ring);
    outline-offset: 1px;
}

/* 朱点：这枚胶囊里唯一的「还在跑」的记号。 */
.dot {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: var(--r-pill);
    background: var(--accent);
}

/* 名字**不收缩**（`flex: none`）：收起来就永远不会有「内容超出、左右滚」这件事。
 * 上限 10em 只为挡住荒谬的长名（它自己省略号收尾），正常三个字远到不了。 */
.name {
    flex: none;
    max-width: 10em;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* 时长跟着名字，中间不断开：它属于这枚胶囊，不属于整行。 */
.time {
    flex: none;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
}

/* 行尾那枚叉只是**可点的提示**，不是第二个按钮（所以模板里它是 `AppIcon` 而不是
 * `<button>`）：巢状按钮会让读屏把「结束这个号」念两遍。悬停跟着胶囊一起转朱。 */
.mark {
    --icon-size: calc(11px * var(--fs-scale));
    flex: none;
    color: var(--muted);
    transition: color var(--t-quick) var(--ease-soft);
}

.live-chip:hover .mark {
    color: var(--accent);
}

.idle {
    margin: 0;
    color: var(--muted);
    font-size: var(--fs-mini);
}
</style>
