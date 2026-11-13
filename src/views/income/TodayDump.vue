<script setup lang="ts">
import { useToday } from '../../composables/use-today';
import { computed } from 'vue';
import LedgerSection from '../../components/LedgerSection.vue';
import NumTag from '../../components/NumTag.vue';
import PressTile from '../../components/PressTile.vue';
import { saved } from '../../composables/save-feedback';
import { notify } from '../../composables/use-notify';

import { amountText, compactAmount, entriesOn, groupByItem, totalsOf } from './income';
import type { ItemGroup } from './income';
import { useIncome } from './income-store';
import { itemIconOf } from './item-icons';
import { useRoster } from '../characters/roster';

const { entries, removeEntry, flush } = useIncome();
const { roster } = useRoster();

/** 今天的记录（`groupByItem` 只要这一天的，日期在右栏是常量）。 */
const today = useToday();
const todayEntries = computed(() => entriesOn(entries.value, today.value));

/** 一格一个「物品 + 单价」，按条数降序——一眼看到「今天点得最多的是什么」。 */
const groups = computed(() => groupByItem(todayEntries.value));

const totals = computed(() => totalsOf(todayEntries.value));

function whoText(ids: readonly string[]): string {
    if (!ids.length) return '';
    const names = ids.map((id) => roster.value.find((one) => one.id === id)?.name ?? '已删角色');
    /* 名字去重：两个都已删的角色会拼成「已删角色、已删角色」，既重复又没信息——
     * 它们本来就已经无法区分了。 */
    return [...new Set(names)].join('、');
}

async function undo(group: ItemGroup) {
    removeEntry(group.lastId);
    const left = group.count - 1;
    /* 带上单价：按价分开之后，同一个名字可能有好几格，只说「已撤掉 定魂珠 一条」
     * 分不清撤的是 4.6 万那格还是 5.2 万那格。 */
    const what = `${group.name} ${compactAmount(group.amount)}`;
    if (await saved(flush))
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
            <span class="v" :class="{ gain: totals.net > 0, loss: totals.net < 0 }">{{
                totals.net < 0 ? `−${amountText(-totals.net)}` : amountText(totals.net)
            }}</span>
        </div>
    </LedgerSection>
</template>

<style scoped>
.grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
    gap: 8px 6px;
}

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
    filter: var(--item-icon-filter);
    opacity: var(--item-icon-opacity);
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
    color: var(--negative);
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
/* 净额与统计条共用进账、出账配色。 */
.total .v.gain {
    color: var(--positive);
}

.total .v.loss {
    color: var(--negative);
}

/* 空态：一句「还没有」，不画空表。留白读作「没做完」，一句话读作「今天还没开始」。 */
.empty {
    padding: 22px 0 18px;
    text-align: center;
}
.empty p {
    margin: 0;
}
</style>
