<script lang="ts">
/**
 * 统计条里的一个数字。
 *
 * 类型放在普通 `<script>` 块里而不是 `<script setup>`：后者不能 `export`
 * （它在编译后是 `setup()` 的函数体），而调用方需要这个类型来拼数组。
 */
export interface StatItem {
    /** 名目（「收入」「笔数」）。 */
    cap: string;
    /**
     * 已经格式化好的读数（`462.5 万` / `−1.2 万` / `3`）。
     * 格式化不在这里做：单位和符号的口径属于业务（`amountText` / `signedOf`），组件只负责摆。
     */
    value: string;
    /** 读数色：赭（金额）、朱（负值与支出）。默认赭——笔数这类不带方向的数也是赭。 */
    tone?: 'num' | 'loss';
}
</script>

<script setup lang="ts">
/**
 * 统计条：n 个数字排成一行，格子之间一条竖线分开。
 *
 * 读作**一行账**，不是 n 张卡——所以没有底色、没有圆角、没有内框，只有外侧那圈
 * 文武线（`.frame`）与每格之间的 1px 账线。卡片化会把「同一天的一组数」切成一堆
 * 互不相干的东西，而这一行本来是在回答同一个问题。
 *
 * 2026-11-05 从收益页抽出来：总览页要显示同一组数（今天 / 近七天切范围那一套），
 * 两处各写一份的话，字号与分割线迟早有一处走样——而这四个数会被并排着看。
 *
 * 列数由 `items.length` 决定（`--stat-n`），不写死 4：这一块以后可能要摆 3 格或 5 格。
 */
withDefaults(defineProps<{ items: StatItem[] }>(), {});
</script>

<template>
    <section class="frame stats-card">
        <div class="stats" :style="{ '--stat-n': items.length }">
            <div v-for="item in items" :key="item.cap" class="stat">
                <div class="cap">{{ item.cap }}</div>
                <div class="v" :class="item.tone ?? 'num'">{{ item.value }}</div>
            </div>
        </div>
    </section>
</template>

<style scoped>
.stats-card {
    padding: 12px 18px;
}
.stats {
    display: grid;
    grid-template-columns: repeat(var(--stat-n, 4), minmax(0, 1fr));
}
/* 每格右侧留 16，下一格再补 16 的左侧内衬——竖线两侧的留白相等，
 * 否则线会被读成「贴着右边那个数」。 */
.stat {
    min-width: 0;
    padding-right: 16px;
}
.stat + .stat {
    padding-left: 16px;
    border-left: var(--w-hair) solid var(--rule);
}
.cap {
    color: var(--muted);
    font-size: var(--fs-xs);
    letter-spacing: 0.08em;
}
/* `--fs-amount` 是账面读数那一档字号：这四个数是这一块的主语，不能与正文同号。
 * 窄的时候省略号而不是换行——换行会把四格的高度撑得不一样高。 */
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
</style>
