<script setup lang="ts">
import { computed, onScopeDispose, ref } from 'vue';
import AppNotice from '../../components/AppNotice.vue';
import SegmentedPills from '../../components/SegmentedPills.vue';
import { confirmDiscardDrafts } from '../../composables/use-draft-guard';
import { activeAppShell, saveAppShell, type AppShell } from '../../services/app-shell';
import { flushPendingWrites } from '../../services/persist';
import SettingsRow from './SettingsRow.vue';

const props = defineProps<{ disabled?: boolean }>();
const glass = activeAppShell === 'liquid';
const options: { value: AppShell; label: string }[] = [
    { value: 'liquid', label: '透明玻璃' },
    { value: 'legacy', label: '经典账簿' },
];
const selectedShell = ref(activeAppShell);
const unavailable = computed(() => props.disabled || selectedShell.value !== activeAppShell);
const error = ref('');
let disposed = false;
onScopeDispose(() => {
    disposed = true;
});

async function switchShell(shell: string) {
    if (unavailable.value || shell === activeAppShell) return;
    if (shell !== 'liquid' && shell !== 'legacy') return;
    selectedShell.value = shell;
    error.value = '';
    let reloading = false;
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
        if (!saveAppShell(shell)) {
            error.value = '无法保存界面选择，请检查本机存储后重试。';
            return;
        }
        location.reload();
        reloading = true;
    } catch {
        error.value = '切换未完成，请重试。';
    } finally {
        if (!reloading) selectedShell.value = activeAppShell;
    }
}
</script>

<template>
    <SettingsRow label="界面" :layout="glass ? 'glass' : 'grid'">
        <slot
            :value="selectedShell"
            :options="options"
            :disabled="unavailable"
            :select="switchShell"
        >
            <SegmentedPills
                :model-value="selectedShell"
                :options="options"
                :disabled="unavailable"
                label="界面"
                @update:model-value="switchShell"
            />
        </slot>
        <template v-if="error" #detail>
            <AppNotice role="alert" tone="error">{{ error }}</AppNotice>
        </template>
    </SettingsRow>
</template>
