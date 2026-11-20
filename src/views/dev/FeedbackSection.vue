<script setup lang="ts">
import { ref } from 'vue';
import LedgerSection from '../../components/LedgerSection.vue';
import SlotButton from '../../components/SlotButton.vue';
import LoadNotice from '../../components/LoadNotice.vue';
import DateRangeField from '../../components/DateRangeField.vue';
import FormActions from '../../components/FormActions.vue';
import DetailTipShell from '../../components/DetailTipShell.vue';
import PressButton from '../../components/PressButton.vue';

/** 纯内存交互示例，不调用账本数据服务。 */
const sampleLoadError = ref('示例：暂时无法读取记录');
const sampleFrom = ref('2026-11-01');
const sampleTo = ref('2026-11-18');
const sampleSaveError = ref('示例：保存失败，可保留输入后重试');
const sampleTipAnchor = ref<DOMRect | null>(null);
function showSampleTip(event: Event) {
    if (event.currentTarget instanceof HTMLElement) {
        sampleTipAnchor.value = event.currentTarget.getBoundingClientRect();
    }
}

async function recoverSample() {
    sampleLoadError.value = '';
}
</script>

<template>
    <LedgerSection plain title="表单与读取反馈" hint="组合组件 · 不读写账本">
        <DateRangeField
            v-model:from="sampleFrom"
            v-model:to="sampleTo"
            from-label="示例开始日期"
            to-label="示例结束日期"
        />
        <div class="modal-actions demo-actions">
            <FormActions
                :error="sampleSaveError"
                :submit-text="sampleSaveError ? '重试保存' : '保存'"
                submit-label="示例保存"
                @cancel="sampleSaveError = '示例：保存失败，可保留输入后重试'"
                @submit="() => (sampleSaveError = '')"
            >
                <PressButton
                    text="详情浮片"
                    label="展示详情浮片示例"
                    aria-describedby="dev-detail-tip"
                    @mouseenter="showSampleTip"
                    @focus="showSampleTip"
                    @mouseleave="sampleTipAnchor = null"
                    @blur="sampleTipAnchor = null"
                />
            </FormActions>
        </div>
        <DetailTipShell
            :open="sampleTipAnchor !== null"
            :anchor="sampleTipAnchor"
            tooltip-id="dev-detail-tip"
        >
            <div class="tip-name">详情浮片</div>
            <p class="note">跟随锚点落位，靠近边缘时自动避让。</p>
        </DetailTipShell>
        <LoadNotice :error="sampleLoadError" :load="recoverSample" />
        <p v-if="!sampleLoadError" class="note">已恢复读取。</p>
        <SlotButton
            v-if="!sampleLoadError"
            text="重置示例"
            label="重置读取失败示例"
            @click="sampleLoadError = '示例：暂时无法读取记录'"
        />
    </LedgerSection>
</template>

<style scoped>
.demo-actions {
    margin: 12px 0;
    padding: 12px 0 0;
}
</style>
