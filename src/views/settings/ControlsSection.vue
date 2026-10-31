<script setup lang="ts">
import { ref } from 'vue';
import AppIcon from '../../components/AppIcon.vue';
import BaseCheck from '../../components/BaseCheck.vue';
import CostSwitch from '../../components/CostSwitch.vue';
import LedgerSection from '../../components/LedgerSection.vue';
import SealMark from '../../components/SealMark.vue';
import SegmentedPills from '../../components/SegmentedPills.vue';

/**
 * 控件：每种动作只有一种质感。
 *
 * 这些状态是本地演示状态，不落盘——它们的作用是让控件「动起来」，
 * 静态截图看不出凹槽的厚度、开关的位移和印的倾斜。
 */
const picked = ref('小号一');
/* 最后一枚「已归档」单独禁用：演示「组里允许有个别选项不可选」，
 * 方向键会跳过它而不是卡在上面。 */
const ledgerOptions = [
    { value: '主号', label: '主号' },
    { value: '小号一', label: '小号一' },
    { value: '小号二', label: '小号二' },
    { value: '已归档', label: '已归档', disabled: true },
];
const cardCost = ref(true);
const autoSave = ref(false);
const onlyEarn = ref(true);
const withCost = ref(false);
</script>

<template>
    <LedgerSection title="控件" seal="件" hint="一种动作只有一种质感">
        <div class="kit">
            <div class="kit-cell">
                <span class="col-head">按钮</span>
                <div class="kit-row">
                    <button class="btn" type="button">次要</button>
                    <button class="btn primary" type="button"><AppIcon name="add" />主要</button>
                    <button class="btn compact" type="button">
                        <AppIcon name="download" />导出
                    </button>
                    <button class="btn" type="button" disabled>禁用</button>
                    <button class="icon-button" type="button" title="编辑">
                        <AppIcon name="edit" />
                    </button>
                    <button class="icon-button" type="button" title="删除">
                        <AppIcon name="trash" />
                    </button>
                </div>
                <p class="note">灌朱的按钮一页不超过两个，主操作只留一个。</p>
            </div>

            <div class="kit-cell">
                <span class="col-head">凹槽胶囊 · 单选</span>
                <div class="kit-row">
                    <SegmentedPills v-model="picked" :options="ledgerOptions" label="账本" />
                </div>
                <p class="note">
                    凹要四件齐（槽底、上暗下亮、上沿内阴影、下沿高光）；选中是灌满，不是描边。
                </p>
            </div>

            <div class="kit-cell">
                <span class="col-head">两格开关 · 位移</span>
                <div class="kit-row">
                    <CostSwitch v-model="cardCost" />
                    <CostSwitch v-model="autoSave" off-label="手动" on-label="自动" />
                </div>
                <p class="note">
                    滑块 240ms <code>cubic-bezier(0.34,1.28,0.6,1)</code> 带过冲；
                    关闭态是灭灯，不是变灰。
                </p>
            </div>

            <div class="kit-cell">
                <span class="col-head">勾选</span>
                <div class="kit-row checks">
                    <BaseCheck v-model="onlyEarn">只显示进账</BaseCheck>
                    <BaseCheck v-model="withCost">含点卡成本</BaseCheck>
                    <BaseCheck :model-value="false" disabled>停用项</BaseCheck>
                </div>
                <p class="note">多选用胶囊、互斥用开关、是/否用勾选——别把三种语义混着用。</p>
            </div>

            <div class="kit-cell">
                <span class="col-head">印章</span>
                <div class="kit-row seals">
                    <SealMark text="梦" />
                    <SealMark text="记" />
                    <SealMark text="账" solid />
                    <span class="hint"
                        >标记已定稿 / 已入账 / 已达成，全站唯一允许歪 2.5° 的元素。</span
                    >
                </div>
            </div>

            <div class="kit-cell">
                <span class="col-head">金额</span>
                <div class="amount-demo">
                    <span class="amount-value">232.6<i>万</i></span>
                    <span class="amount-note">净收益 · 今日</span>
                </div>
                <p class="note">
                    金额单独一档字号（29px），下方一条金额线；它是唯一允许超过页面标题的字。
                </p>
            </div>
        </div>
    </LedgerSection>
</template>

<style scoped>
.amount-demo {
    display: flex;
    align-items: center;
    gap: 12px;
}
.amount-value {
    padding-bottom: 3px;
    border-bottom: var(--w-hair) solid var(--rule-2);
    color: var(--ink);
    font-size: var(--fs-amount);
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
}
.amount-value i {
    margin-left: 4px;
    color: var(--muted);
    font-family: var(--font-ui);
    font-size: var(--fs-sm);
    font-style: normal;
}
.amount-note {
    color: var(--muted);
    font-size: var(--fs-xs);
}
</style>
