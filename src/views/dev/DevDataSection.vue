<script setup lang="ts">
import { computed, ref } from 'vue';
import LedgerSection from '../../components/LedgerSection.vue';
import CostSwitch from '../../components/CostSwitch.vue';
import SlotButton from '../../components/SlotButton.vue';
import { askConfirm } from '../../composables/use-confirm';
import { useDevMode } from '../../composables/use-dev-mode';
import { hasDesktop } from '../../services/desktop';
import { dataImportPayload } from '../../services/data-files';
import { gameDataReady } from '../../services/game-data';
import { reloadWithDataNotice } from '../settings/data-notice';
import { buildDemoData, demoCounts } from './demo-data';

const { devMode } = useDevMode();
const desktop = hasDesktop();
const busy = ref(false);
const error = ref('');
const counts = computed(() => gameDataReady.value ? demoCounts(buildDemoData()) : null);

async function importDemo() {
    if (busy.value || !desktop || !gameDataReady.value) return;
    busy.value = true;
    error.value = '';
    try {
        const data = buildDemoData();
        const ok = await askConfirm({
            danger: true,
            title: '用模拟数据替换全部账本？',
            note: '角色、物价、收益、账号、目标、仓库、上线记录、速记单价及点卡口径都会替换。替换前自动备份；完成后重新加载并显示备份位置。外观偏好不变。',
            confirmText: '备份并替换',
            cancelText: '保持现状',
        });
        if (!ok) return;
        const outcome = await dataImportPayload(JSON.stringify(data));
        if (outcome.status === 'failed') error.value = outcome.error;
        else if (outcome.status === 'ok') {
            reloadWithDataNotice(outcome.detail, '', '#/settings');
        }
    } catch (cause) {
        error.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
        busy.value = false;
    }
}
</script>

<template>
    <div class="stack-pair">
        <LedgerSection title="开发者模式" hint="仅控制测试入口" plain>
            <div class="form-row">
                <span class="field-label">测试工具</span>
                <CostSwitch
                    v-model="devMode"
                    label="开发测试工具"
                    off-label="关"
                    on-label="开"
                    :disabled="busy"
                />
            </div>
            <p class="note">
                {{ devMode ? '捉鬼助手显示「测试文字」。' : '捉鬼助手不生成「测试文字」。' }}
            </p>
            <p class="note">入口：三连击左栏顶部的标，或访问 <code>#/dev</code>。</p>
        </LedgerSection>
        <LedgerSection title="模拟数据" hint="整套演示账本" plain>
            <div class="form-row">
                <SlotButton
                    icon="flask"
                    :text="busy ? '导入中…' : '导入'"
                    label="导入模拟数据"
                    :disabled="busy || !desktop || !gameDataReady"
                    @click="importDemo"
                />
                <span v-if="counts" class="meta">
                    {{ counts.characters }} 个角色 · {{ counts.goals }} 个目标 ·
                    {{ counts.warehouse }} 件物品
                </span>
            </div>
            <p class="note">包含角色、物价、收益、账号交易、目标、仓库与上线记录。</p>
            <p class="note">替换全部账本，先自动备份；可在设置页恢复。后续示例统一在此维护。</p>
            <p v-if="!desktop" class="note">请在桌面版导入，浏览器预览不写入账本。</p>
            <div role="status"><p v-if="error" class="note error">{{ error }}</p></div>
        </LedgerSection>
    </div>
</template>
