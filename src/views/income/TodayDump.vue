<script setup lang="ts">
import { computed } from 'vue';
import LedgerSection from '../../components/LedgerSection.vue';
import NumTag from '../../components/NumTag.vue';
import PressTile from '../../components/PressTile.vue';
import { notify } from '../../composables/use-notify';
import { todayText } from '../../services/format';
import { amountText, compactAmount, entriesOn, groupByItem, totalsOf } from './income';
import type { ItemGroup } from './income';
import { useIncome } from './income-store';
import { itemIconOf } from './item-icons';
import { useRoster } from '../characters/roster';

/**
 * 今日速记：右边这一列，**一格一个「物品 + 单价」，与左栏同一套语言**（2026-11-04 用户：
 * 「不要列表这种汇总，一个图标 × 20 这种，一眼可以看清的」；后又补「固定价格的可以 ×N，
 * 不固定的价格不同的就分开，并且也显示图标以及价格，类似于左边」）。
 *
 * 早先这里是逐条流水（时间 / 名字 / 角色 / 金额 / ×）。它有两个用处，换形态时都不能丢：
 * 1. **回执** —— 刚点的那一条在不在。`×3` 从 `×2` 变过来的那一下就是回执；
 * 2. **后悔药** —— 点一格撤掉最近记的那一条。
 *
 * ---- 为什么按「物品 + 单价」分组 ----
 *
 * 只按名字聚合时，浮动价的物品（金币、代练）会挤进同一格：一格只能印一个数，而它不代表
 * 组里任何一条——上午 4.6 万、下午 5.2 万，合成一格显示哪个都是错的。分成「名字 + 价」
 * 之后，`amount × count` 恒等于这一格，`×N` 只表示「这个价点了 N 次」——固定价天然是
 * 一个大 `×N`，浮动价是几个 `×1`，两种都读得对。这一条规则在 `groupByItem` 里。
 *
 * 为什么聚合反而更好用：速记是连点的动作，一天点十几次同一个物品很正常，逐条列出来会有
 * 二十行长得一模一样的「定魂珠 4.6 万」，而人真正想确认的是「今天点了几次、有没有多点
 * 一下」。二十行里数不出「二十」，一格 `×20` 一眼就是。
 *
 * ---- 与左栏长得像，为什么这次可以 ----
 *
 * **点一格 = 撤一条**，与左栏「点一下记一条」方向相反。上一版靠「这里没有厚度、只有细边」
 * 来区分，是为了防误按。2026-11-04 用户要求「类似于左边」——照做，靠三样区分：
 * 这里带 `×N`、块小一号（36 对 44）、`×N` 挂在整格右侧（左栏没有这一列）。
 * 撤错的代价本来就低（再点一下原物品就记回来），这是可以接受的交换。
 */
const { entries, removeEntry } = useIncome();
const { roster } = useRoster();

/** 今天的记录（`groupByItem` 只要这一天的，日期在右栏是常量）。 */
const todayEntries = computed(() => entriesOn(entries.value, todayText()));

/** 一格一个「物品 + 单价」，按条数降序——一眼看到「今天点得最多的是什么」。 */
const groups = computed(() => groupByItem(todayEntries.value));

const totals = computed(() => totalsOf(todayEntries.value));

/**
 * 这一组记给过谁，拼成一句人话（空数组 = 全程未指定，返回空串）。
 *
 * 聚合之后界面上一格只有图标与 `×N`，**归属就只剩这一处看得见**——而那排「记给」胶囊
 * 会停在最后一次的选择上，换号忘了切，后面几条就全进了上一个号。找不到人写「已删角色」，
 * 与前面那条同一条理由：账不清人，这个状态会真实存在。
 */
function whoText(ids: readonly string[]): string {
    if (!ids.length) return '';
    const names = ids.map((id) => roster.value.find((one) => one.id === id)?.name ?? '已删角色');
    /* 名字去重：两个都已删的角色会拼成「已删角色、已删角色」，既重复又没信息——
     * 它们本来就已经无法区分了。 */
    return [...new Set(names)].join('、');
}

/**
 * 撤掉这一格**最近记的那一条**，不是整格清空。
 *
 * 整格清空看着更快，但它把「多点了一下」和「点了二十下要全撤」当成同一件事，
 * 而后者的真实做法是「一开始就别点」。撤一条、再撤一条，`×20 → ×19 → ×18`
 * 自己数得清；一把清空之后，用户要先想起来「刚才那一格原来有几个」。
 */
function undo(group: ItemGroup) {
    removeEntry(group.lastId);
    const left = group.count - 1;
    /* 带上单价：按价分开之后，同一个名字可能有好几格，只说「已撤掉 定魂珠 一条」
     * 分不清撤的是 4.6 万那格还是 5.2 万那格。 */
    const what = `${group.name} ${compactAmount(group.amount)}`;
    notify.success(
        left > 0
            ? `已撤掉 ${what} 一条 · 还剩 ${left} 条`
            : `已撤掉 ${what}${group.kind === 'expense' ? ' 的支出' : ''}`,
    );
}
</script>

<template>
    <LedgerSection title="今日速记" :hint="`${totals.count} 条`">
        <div v-if="!groups.length" class="empty">
            <p>今天还没有记账。</p>
            <p class="meta">点左边的物品格，一条就记上了。</p>
        </div>

        <!-- 一格一个「物品 + 单价」：左上压印块（图标）、左下价格签，`×N` 在整格右侧。
             点一下撤掉最近那一条（见 script 里的理由）。 -->
        <div v-else class="grid">
            <button
                v-for="group in groups"
                :key="group.key"
                type="button"
                class="g"
                :class="{ out: group.kind === 'expense' }"
                :title="`${group.name} · ${compactAmount(group.amount)} · ${group.count} 条 · 合计 ${amountText(group.total)}${whoText(group.whoIds) ? ` · 记给 ${whoText(group.whoIds)}` : ''}（点一下撤掉最近一条）`"
                :aria-label="`${group.name}，单价 ${compactAmount(group.amount)}，今天 ${group.count} 条，合计 ${amountText(group.total)}${whoText(group.whoIds) ? `，记给 ${whoText(group.whoIds)}` : ''}，点一下撤掉最近一条`"
                @click="undo(group)"
            >
                <PressTile class="g-tile">
                    <img
                        v-if="itemIconOf(group.name)"
                        :src="itemIconOf(group.name)"
                        alt=""
                        loading="lazy"
                    />
                    <!-- 反查不到图标就写名字：图可以缺，账不能看不出是什么。 -->
                    <span v-else class="txt">{{ group.name }}</span>
                </PressTile>
                <NumTag class="price">
                    <span class="v">{{ compactAmount(group.amount) }}</span>
                </NumTag>
                <span class="n">×{{ group.count }}</span>
            </button>
        </div>

        <div class="total">
            <span class="k">净额</span>
            <!-- 与页头统计条同一条：负数带 `−`，不能只靠颜色。 -->
            <span class="v" :class="{ loss: totals.net < 0 }">{{
                totals.net < 0 ? `−${amountText(-totals.net)}` : amountText(totals.net)
            }}</span>
        </div>
    </LedgerSection>
</template>

<style scoped>
/* 一格一个「物品 + 单价」：**左边一列是块与签（上下同轴），右边一列是 `×N`**，三列。
 *
 * 2026-11-04 用户两次收：先说「图标过大，可以缩小」（32 → 26），再说「固定价格的可以
 * ×N、不固定的价格不同的就分开，并且也显示图标以及价格，类似于左边」，最后是
 * 「让图标和价格对齐，×N 放在整体后面」。
 *
 * ---- 为什么是三列而不是四列 ----
 *
 * 上一版把「签 + ×N」装在同一个 flex 行里居中，于是签的中心被 ×N 推向左边，
 * 而上面那块印是居中的——两个中心错开，「图标和价格没对齐」就是在说这个。
 * 拆成两列之后，签与块同在第一列、各自居中 ⇒ 中心严格同轴；`×N` 落到第二列，
 * 即「整体后面」。
 *
 * 拆开也要占宽度：左列最宽能到 53（「128.5万」这种长签），加 `×N` 的 14 与缝 4 是 71。
 * 四列时每格只有 61，放不下；三列每格 82，正好。
 */
.grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
    gap: 8px 6px;
}
/* 两行两列：左上块、左下签、右侧跨两行的 `×N`。
 *
 * 第一列**定宽 56**而不是 `auto`：`auto` 时列宽跟着签的长短走，于是每个格子的 `×N`
 * 落在不同的水平位置上，一整列扫下来是参差的。定宽之后块与签都在这 56 里居中
 * （中心同在 28），`×N` 也逐格对齐。
 * 56 的来由：最长的签是「128.5万」量级，`--fs-mini` 下约 53。
 *
 * `justify-content: center` 把「左列 + 右列」当作一整组在格内居中。 */
.g {
    display: grid;
    grid-template-columns: 56px auto;
    grid-template-areas:
        'tile n'
        'price n';
    align-items: center;
    justify-content: center;
    justify-items: center;
    column-gap: 4px;
    row-gap: 3px;
    padding: 0;
    border: 0;
    background: none;
    font-family: inherit;
    cursor: pointer;
}
.g-tile {
    grid-area: tile;
    --tile-w: 36px;
    --tile-h: 36px;
    --tile-r: var(--r-2);
    /* 落影 0.4：36 比左栏的 44 还小，按 0.55 落 1.65px 的硬影会糊成一圈灰边。 */
    --tile-drop: 0.4;
    --tile-face: var(--paper-2);
    --tile-face-hover: var(--paper);
}
.g:focus-visible {
    outline: var(--ring);
    outline-offset: var(--ring-offset);
}
.g img {
    width: 26px;
    height: 26px;
    object-fit: contain;
    /* 与左栏同一道「纸化」：小图不调会像贴纸。 */
    filter: sepia(0.22) saturate(0.86) contrast(0.98);
    opacity: 0.94;
}
:global(html.dark) .g img {
    filter: sepia(0.18) saturate(0.8) brightness(0.86);
}
/* 没有图标时的兜底：物品名压到与图标同大的一格，两行之内收住。 */
.g .txt {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    overflow: hidden;
    color: var(--ink-2);
    font-size: var(--fs-mini);
    line-height: 1.05;
    text-align: center;
}
/* 签：`min-width` 与块同宽（36），短价不至于比上面的块还窄；长的自然撑开，
 * 块仍在它中间——两条中线重合才算「对齐」。 */
.price {
    grid-area: price;
    --tag-h: calc(14px * var(--fs-scale));
    min-width: 36px;
    font-size: var(--fs-mini);
    line-height: 1;
}
.price .v {
    color: var(--num);
}
/* `×N` 在整格后面，与「块 + 签」这一组**垂直居中**（`grid-area: n` 跨两行）。
 * 不再与签同色同号挤在一行：它是次数，不是价格，本来就不该和价贴在一起。 */
.g .n {
    grid-area: n;
    color: var(--num);
    font-size: var(--fs-mini);
    line-height: 1;
    white-space: nowrap;
}
/* 支出那一组转朱（与合计条里的「支」同一套），收入保持赭。 */
.g.out .n,
.g.out .price .v {
    color: var(--cinnabar);
}

.total {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-top: 10px;
    padding-top: 9px;
    border-top: var(--w-hair) solid var(--rule-2);
}
.total .k {
    color: var(--muted);
    font-size: var(--fs-xs);
    letter-spacing: 0.08em;
}
.total .v {
    margin-left: auto;
    color: var(--num);
    font-size: var(--fs-amount);
}
/* 净额为负时整句转朱：「今天亏了」不该是一个只在符号上不同的棕色数字。 */
.total .v.loss {
    color: var(--cinnabar);
}

/* 空态：一句「还没有」，不画空表。留白读作「没做完」，一句话读作「今天还没开始」。 */
.empty {
    padding: 22px 0 18px;
    text-align: center;
}
.empty p {
    margin: 0;
}
.empty .meta {
    margin-top: 4px;
}
</style>
