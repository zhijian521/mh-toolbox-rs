<script setup lang="ts">
import LedgerSection from '../../components/LedgerSection.vue';

/**
 * 结构：文武线与账线。
 *
 * 这两件是整套语言的骨架——本页每个区块都是文武线，列表都是账线。
 * 演示数据用真实收益页的形状（时间 / 角色 / 来源 / 金额），空壳表格看不出对齐。
 */
const rows: [string, string, string, string][] = [
    ['09:12', '黑山老妖', '师门任务', '8.8'],
    ['11:44', '一剪梅', '金柳露 ×3', '8.4'],
    ['12:25', '五开合计', '点卡成本', '96.0'],
];
</script>

<template>
    <LedgerSection title="结构" hint="结构靠线，不靠阴影">
        <div class="structure">
            <div class="ledger-demo">
                <div class="ledger-head">
                    <span class="col-head">时间</span>
                    <span class="col-head">角色</span>
                    <span class="col-head">来源</span>
                    <span class="col-head amount-col">金额</span>
                </div>
                <div v-for="row in rows" :key="row[0]" class="ledger-line">
                    <span class="time">{{ row[0] }}</span>
                    <span>{{ row[1] }}</span>
                    <span class="from">{{ row[2] }}</span>
                    <span class="amount-col num" :class="{ out: row[3] === '96.0' }">{{
                        row[3]
                    }}</span>
                </div>
            </div>
            <div class="structure-note">
                <p class="note">
                    <b>文武线</b>：外框 1px <code>--rule-2</code> + 内框 1px <code>--rule</code>，
                    中间留 3px——本页每个区块都是它，替代旧版的「圆角卡片 + 投影」。
                </p>
                <p class="note">
                    <b>账线</b>：行高严格 28px，线在 27–28px 之间。只用在「一行一条记录」的列表上，
                    铺到底色上就成格子纸，反而看不清字。
                </p>
            </div>
        </div>
    </LedgerSection>
</template>

<style scoped>
.structure {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 16px;
}
.ledger-demo {
    border-top: var(--w-rule) solid var(--rule-2);
}
.ledger-head,
.ledger-line {
    display: grid;
    grid-template-columns: 54px 92px minmax(0, 1fr) 70px;
    align-items: center;
    gap: 8px;
    height: 28px;
    font-size: var(--fs-sm);
}
.ledger-head {
    height: 24px;
    border-bottom: var(--w-hair) solid var(--rule-2);
}
.ledger-line {
    border-bottom: var(--w-hair) solid var(--rule);
}
.ledger-line .time {
    color: var(--muted);
    font-family: var(--font-ui);
    font-size: var(--fs-xs);
    font-variant-numeric: tabular-nums;
}
.ledger-line .from {
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.amount-col {
    text-align: right;
}
.ledger-line .amount-col {
    color: var(--ink);
}
/* 支出用朱：全站只有区块标、当前选中、支出金额三处允许朱红。 */
.ledger-line .amount-col.out {
    color: var(--cinnabar);
}
.structure-note {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

@media (max-width: 1080px) {
    .structure {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
