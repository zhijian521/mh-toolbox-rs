<script setup lang="ts">
import { onScopeDispose, ref } from 'vue';
import AppNotice from '../../components/AppNotice.vue';
import PressButton from '../../components/PressButton.vue';
import { confirmDiscardDrafts } from '../../composables/use-draft-guard';
import { activeAppShell, saveAppShell } from '../../services/app-shell';
import { flushPendingWrites } from '../../services/persist';
import SettingsRow from './SettingsRow.vue';

const props = defineProps<{ disabled?: boolean }>();
const glass = activeAppShell === 'liquid';
const label = glass ? '切换到经典账簿' : '切换到透明玻璃';
const switching = ref(false);
const error = ref('');
let disposed = false;
onScopeDispose(() => {
    disposed = true;
});

async function switchShell() {
    if (props.disabled || switching.value) return;
    switching.value = true;
    error.value = '';
    try {
        if (!(await confirmDiscardDrafts())) return;
        const { flushDailySync } = await import('../accounts/daily-sync');
        const synced = await flushDailySync();
        const saved = await flushPendingWrites();
        if (disposed || props.disabled) return;
        if (!synced || !saved) {
            error.value = '账本还有改动未保存，请重试保存后再切换。';
            return;
        }
        if (!saveAppShell(glass ? 'legacy' : 'liquid')) {
            error.value = '无法保存界面选择，请检查本机存储后重试。';
            return;
        }
        location.reload();
    } catch {
        error.value = '切换未完成，请重试。';
    } finally {
        switching.value = false;
    }
}
</script>

<template>
    <SettingsRow label="界面" :layout="glass ? 'glass' : 'grid'">
        <slot :label="label" :disabled="disabled || switching" :activate="switchShell">
            <PressButton
                :label="label"
                :text="label"
                :disabled="disabled || switching"
                title="切换并重新加载应用"
                @click="switchShell"
            />
        </slot>
        <template v-if="error" #detail>
            <AppNotice role="alert" tone="error">{{ error }}</AppNotice>
        </template>
    </SettingsRow>
</template>
