<script setup lang="ts">
import { ref } from 'vue';
import AppNotice from '../../components/AppNotice.vue';
import CostSwitch from '../../components/CostSwitch.vue';
import { readOcrPreference, saveFastOcr } from '../../services/ocr-preference';

const enabled = ref(readOcrPreference().enabled);
const error = ref('');

function change(value: boolean) {
    if (saveFastOcr(value)) {
        enabled.value = value;
        error.value = '';
    } else {
        error.value = '快速识别设置保存失败，请重试。';
    }
}
</script>

<template>
    <div class="ocr-setting">
        <div class="ocr-toggle">
            <span>快速识别（实验）</span>
            <slot :enabled="enabled" :change="change">
                <CostSwitch
                    :model-value="enabled"
                    label="快速识别（实验）"
                    aria-describedby="fast-ocr-help"
                    off-label="关"
                    on-label="开"
                    @update:model-value="change"
                />
            </slot>
        </div>
        <p id="fast-ocr-help" class="note">
            使用本机显卡加速提醒助手、捉鬼助手和角色截图识别（含装备、召唤兽）。显卡不支持 Vulkan
            或识别引擎出错时，自动使用标准识别。
        </p>
        <p class="note">捉鬼和截图从下次识别起生效。提醒助手正在监听时，请停止后重新开启。</p>
        <AppNotice v-if="error" tone="error" role="alert">{{ error }}</AppNotice>
    </div>
</template>

<style scoped>
.ocr-setting {
    display: grid;
    gap: 6px;
}
.ocr-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}
.note {
    margin: 0;
}
</style>
