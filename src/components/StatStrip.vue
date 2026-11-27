<script lang="ts">
/**
 * 统计条里的一个数字。
 *
 * 类型放在普通 `<script>` 块里而不是 `<script setup>`：后者不能 `export`
 * （它在编译后是 `setup()` 的函数体），而调用方需要这个类型来拼数组。
 */
export interface StatItem {
    /** 可选稳定标识，供调用方定位读数。 */
    id?: string;
    /** 名目（「收入」「笔数」）。 */
    cap: string;
    /**
     * 已经格式化好的读数（`462.5 万` / `−1.2 万` / `3`）。
     * 格式化不在这里做：单位和符号的口径属于业务（`amountText` / `signedOf`），组件只负责摆。
     */
    value: string;
    /** 紧随读数的单位，不参与格式化。 */
    unit?: string;
    /** 标签的补充说明。 */
    hint?: string;
    /** 未读取时保留业务提供的文字，并降低读数强调。 */
    unavailable?: boolean;
    /**
     * 读数色。三档各有方向：
     *   - `gain` 苔绿：进账（收入、为正的净额）；
     *   - `loss` 朱红：出账（支出、为负的净额）；
     *   - `num` 赭：不带方向的数（笔数、支出为 0 时的「—」）。
     *
     * 2026-11-11 用户：「统计上的数字字体颜色优化一下，一般收益为绿色，花费为红色」。
     * 用的是现有的 `--moss` / `--cinnabar`，不新造色号——它们本来就管「好」与「坏」。
     */
    tone?: 'num' | 'gain' | 'loss';
    /**
     * 副文左段：这一格由什么组成（「31 笔 · 均 14.9 万」「结余率 97.3%」「4 个号」）。
     *
     * **由调用方给字符串**，组件不认识「笔均」也不认识「结余率」：这两个口径住在
     * `income.ts`，收益页与总览页共用同一份（`statRowsOf`）。放到组件里算，
     * 两页就会各长一套，而它们显示的是同一组数。
     */
    sub?: string;
    /** 副文右段：较上一档的增减，已带符号（`+12.4%` / `±0 笔` / `—`）。 */
    delta?: string;
}
</script>

<script setup lang="ts">
import AppIcon from './AppIcon.vue';
import FoldedCard from './FoldedCard.vue';
import type { IconName } from './icons';
import PaperCard from './PaperCard.vue';
import TicketCard from './TicketCard.vue';
import { GlassCard } from './liquid-glass';

/**
 * standalone 每项独立成卡，embedded、folded 和 glass 在同一张卡内排列读数。
 * 组件只排列已格式化读数，统计口径、加载状态和正负判断由业务提供。
 */
withDefaults(
    defineProps<{
        items: StatItem[];
        surface?: 'standalone' | 'embedded' | 'folded' | 'glass';
        centered?: boolean;
        spine?: 'left' | 'right';
        heading?: string;
        hint?: string;
        icon?: IconName;
    }>(),
    { surface: 'standalone', spine: 'right', heading: '', hint: '' },
);

const surfaces = {
    standalone: 'section',
    embedded: TicketCard,
    folded: FoldedCard,
    glass: GlassCard,
};
</script>

<template>
    <component
        :is="surfaces[surface]"
        :radius="surface === 'glass' ? 18 : undefined"
        :spine="surface === 'folded' ? spine : undefined"
        class="stats"
        :class="{
            'stats-embedded': surface !== 'standalone',
            'stats-centered': centered && surface !== 'standalone',
            'stats-folded': surface === 'folded',
            'stats-glass': surface === 'glass',
        }"
        :style="{ '--stat-n': items.length }"
    >
        <header
            v-if="heading"
            class="stats-head"
            :class="{ 'ticket-rule': surface === 'embedded' || surface === 'folded' }"
            :title="hint"
        >
            <AppIcon
                v-if="surface !== 'standalone' && icon"
                :name="icon"
                class="stats-heading-icon"
            />
            <h3>{{ heading }}</h3>
            <div v-if="$slots.actions" class="stats-actions"><slot name="actions" /></div>
        </header>
        <component
            :is="surface !== 'standalone' ? 'div' : PaperCard"
            v-for="item in items"
            :key="item.id ?? item.cap"
            :as="surface !== 'standalone' ? undefined : 'div'"
            class="stat"
            :data-stat-id="item.id"
        >
            <div class="cap" :title="item.hint">{{ item.cap }}</div>
            <!-- 品名与读数之间那道虚线，与物价卡同一个说法：上半写名目、下半写数目。 -->
            <span class="dash" aria-hidden="true" />
            <div class="v" :class="[item.tone ?? 'num', { unavailable: item.unavailable }]">
                {{ item.value }}<small v-if="item.unit" class="stat-unit">{{ item.unit }}</small>
            </div>
            <div v-if="item.sub || item.delta" class="subrow">
                <span class="sub">{{ item.sub }}</span>
                <span class="delta">{{ item.delta }}</span>
            </div>
        </component>
    </component>
</template>

<style scoped>
/* 四块之间 16：与 `.income-stack` / `.split` 同一个数。纸有 10px 的软影探出卡外，
 * 10 的间距会让邻卡的影压在这张的边角上，四张读作「糊在一起」。 */
.stats {
    display: grid;
    grid-template-columns: repeat(var(--stat-n, 4), minmax(0, 1fr));
    gap: 16px;
}

/* 每格是一张 `.board`（PaperCard 的根）。这里只覆盖内边距：`.board` 通用的 20 是给
 * 整块内容页的，统计签只有四行小字，20 会把格子撑得又高又空。
 *
 * 选择器特异性与 `.board` 同为 0-1-0，靠注入顺序（组件 scoped 在全局 base.css 之后）
 * 生效——`LedgerSection` 的 `--block-pad` 走的也是这条路。 */
.stat {
    display: flex;
    flex-direction: column;
    min-width: 0;
    /* 高度不写死：字号有 1.0 / 1.1 两档，写死会把副文挤到纸外面。88 只是下限，
     * 让四张卡在「一格内容很少」时也与原来的高度一致，不会缩成四片薄条。 */
    min-height: 88px;
    padding: 9px 13px 10px;
}

.cap {
    color: var(--muted);
    font-size: var(--fs-xs);
    letter-spacing: 0.08em;
}

.dash {
    display: block;
    margin: 5px 0 4px;
    border-top: 1px dashed var(--rule-2);
}

/* `--fs-amount` 是账面读数那一档字号：这四个数是这一块的主语，不能与正文同号。
 * 窄的时候省略号而不是换行——换行会把四格的高度撑得不一样高。 */
.v {
    overflow: hidden;
    font-size: var(--fs-amount);
    line-height: 1.3;
    white-space: nowrap;
    text-overflow: ellipsis;
}
/* 三档色（2026-11-11 用户「一般收益为绿色，花费为红色」）。
 * 用现成的 `--moss` / `--cinnabar`，它们本来就在亮暗两套里各翻过一次面，不必新调色号。 */
.num {
    color: var(--num);
}
.gain {
    color: var(--positive);
}
/* 支出与净额为负时转朱：与卡上的三层（墨名目 / 赭读数 / 朱强调）同一条。 */
.loss {
    color: var(--negative);
}

/* 副文行两端对齐：左段吃满剩余宽度（放不下就省略号），右段永不让位。
 * 右段是「较上一档」，它比左段短得多，挤掉它等于把结论丢了。 */
.subrow {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-top: auto;
    padding-top: 4px;
}
.sub {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    color: var(--muted);
    font-size: var(--fs-mini);
    line-height: 1.5;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    text-overflow: ellipsis;
}
.delta {
    flex: none;
    color: var(--muted);
    font-size: var(--fs-mini);
    line-height: 1.5;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}

.stats-embedded:not(.stats-folded, .stats-glass) {
    --ticket-notch-y: calc(12px + var(--fs-base) * 0.96 * 1.3 + 10.5px);

    padding: 12px 16px 15px;
}
.stats-embedded {
    grid-template-columns: repeat(var(--stat-columns, 2), minmax(0, 1fr));
    align-content: start;
    gap: 12px;
}
.stats-head {
    grid-column: 1 / -1;
    min-width: 0;
}
.stats-head:has(.stats-actions) {
    flex-wrap: wrap;
}
.stats-actions {
    min-width: 0;
    max-width: 100%;
    margin-inline-start: auto;
}
.stats-folded {
    --folded-pad-block: 15px 18px;
}
.stats-head h3 {
    color: var(--muted);
    font-size: calc(var(--fs-base) * 0.96);
}
.stats-embedded .stats-head {
    position: relative;
    display: flex;
    align-items: center;
    gap: 7px;
    margin-inline: -10px;
    padding-inline: 10px;
    padding-bottom: 10px;
    border-bottom: 1px dashed transparent;
}
.stats-heading-icon {
    --icon-size: calc(14px * var(--fs-scale));
    color: var(--stats-ink, var(--accent));
}
.stats-embedded .stats-head h3 {
    color: var(--ink);
    line-height: 1.3;
}
.stats-glass {
    padding: var(--block-pad);
}
.stats-glass .stats-head {
    margin: 0;
    padding: 0;
    border: 0;
}
.stats-embedded .stat {
    position: relative;
    z-index: 1;
    min-height: 0;
    padding: 0;
    gap: 3px;
}
.stats-embedded .cap {
    font-size: calc(var(--fs-xs) * 0.97);
    letter-spacing: normal;
}
.stats-embedded .dash {
    display: none;
}
.stats-embedded .v {
    overflow: visible;
    font-size: calc(var(--fs-amount) * 0.9);
    white-space: normal;
    overflow-wrap: anywhere;
}
.stats-embedded .num {
    color: var(--ink);
}
.stats-centered.stats-embedded {
    column-gap: 0;
}
.stats-centered.stats-embedded .stat {
    align-items: center;
    padding: 6px 4px;
    text-align: center;
}
.stats-centered .stat + .stat::before {
    content: '';
    position: absolute;
    inset-inline-start: 0;
    top: 50%;
    height: 1.25em;
    border-inline-start: 1px solid var(--rule);
    transform: translateY(-50%);
    pointer-events: none;
}
.stats-centered .v {
    max-width: 100%;
}
.v.unavailable {
    color: var(--muted);
}
.stat-unit {
    margin-left: 5px;
    color: var(--muted);
    font-size: var(--fs-xs);
}
</style>
