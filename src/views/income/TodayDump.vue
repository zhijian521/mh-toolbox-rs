<script setup lang="ts">
import { useToday } from '../../composables/use-today';
import { computed } from 'vue';
import { ledgerMoneyText } from '../../services/format';
import LedgerSection from '../../components/LedgerSection.vue';
import PressTile from '../../components/PressTile.vue';
import NumTag from '../../components/NumTag.vue';
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
    if (!removeEntry(group.lastId)) {
        notify.error('这条记录未撤回，请检查账本状态后重试');
        return;
    }
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
    <LedgerSection title="今日速记" :hint="`${totals.count} 条`" plain class="today-dump">
        <div v-if="!groups.length" class="empty">
            <p>今天还没有记账。</p>
        </div>

        <!-- 一格一个「物品 + 单价」，点一下只撤掉该组最近一条。 -->
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
            <!-- 净额负数带 `−`，不能只靠颜色。 -->
            <span class="v" :class="{ gain: totals.net > 0, loss: totals.net < 0 }">{{
                ledgerMoneyText(totals.net, 'cash', { sign: 'auto', zero: 'dash' })
            }}</span>
        </div>
    </LedgerSection>
</template>

<style scoped>
.today-dump {
    display: flex;
    flex-direction: column;
    min-width: 0;
}
.today-dump :deep(.section-body) {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 16px;
}
.grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(calc(82px * var(--fs-scale)), 1fr));
    align-content: start;
    gap: 12px 8px;
}
.g {
    display: grid;
    grid-template-columns: 56px minmax(0, auto);
    grid-template-areas:
        'tile n'
        'price n';
    align-items: center;
    justify-content: center;
    justify-items: center;
    gap: 6px 4px;
    min-width: 0;
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
    --tile-drop: 0.4;
    --tile-face: var(--paper);
    --tile-face-hover: var(--paper-2);
}
.g:focus-visible {
    outline: var(--ring);
    outline-offset: var(--ring-offset);
}
.g img {
    width: 26px;
    height: 26px;
    object-fit: contain;
    filter: var(--item-icon-filter);
    opacity: var(--item-icon-opacity);
}
/* 图标可能缺失，物品名保留在同一按钮内兜底，完整名称仍可由提示读取。 */
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
/* 数量跨图标与价格两行，不和单价混在一起。 */
.g .n {
    grid-area: n;
    color: var(--num);
    font-size: var(--fs-mini);
    line-height: 1;
    overflow-wrap: anywhere;
}
.g.out .n,
.g.out .price .v {
    color: var(--negative);
}
.total {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-top: auto;
    padding-top: 12px;
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
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
}
.total .v.gain {
    color: var(--positive);
}
.total .v.loss {
    color: var(--negative);
}
.empty {
    display: grid;
    flex: 1;
    place-items: center;
    padding: 28px 0;
    text-align: center;
}
.empty p {
    margin: 0;
}
</style>
