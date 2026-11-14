<script setup lang="ts">
import { computed, ref } from 'vue';
import PressButton from '../../components/PressButton.vue';
import { checkUpdate, type UpdateResult } from '../../services/updates';
import { openExternal } from '../../services/desktop';
import { useAppInfo } from '../../composables/use-app-info';

const { version } = useAppInfo();
const busy = ref(false),
    error = ref(''),
    result = ref<UpdateResult | null>(null);
const message = computed(() => {
    if (busy.value) return '正在检查…';
    if (error.value) return error.value;
    if (result.value?.status === 'none') return '暂无正式版本';
    if (result.value?.status === 'current') return '暂无更新版本';
    if (result.value?.status === 'available') return `发现新版本 ${result.value.version}`;
    return '手动检查正式版本';
});
async function check() {
    if (busy.value) return;
    busy.value = true;
    error.value = '';
    try {
        result.value = await checkUpdate(version.value);
    } catch (cause) {
        result.value = null;
        error.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
        busy.value = false;
    }
}
async function download() {
    if (result.value?.status !== 'available') return;
    if (!(await openExternal(result.value.url))) error.value = '下载页未能打开，请重试';
}
</script>

<template>
    <div class="update-check">
        <span
            role="status"
            :class="{ error: !!error, available: result?.status === 'available' }"
            >{{ message }}</span
        >
        <PressButton
            v-if="result?.status === 'available'"
            text="下载"
            label="打开新版本下载页"
            icon="download"
            @click="download"
        />
        <PressButton
            text="检查更新"
            label="检查正式版本更新"
            icon="refresh"
            :disabled="busy"
            @click="check"
        />
    </div>
</template>

<style scoped>
.update-check {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 14px;
    padding-top: 12px;
    border-top: var(--w-hair) solid var(--rule-2);
}
.update-check > span {
    flex: 1;
    min-width: 120px;
    font-size: var(--fs-xs);
    color: var(--muted);
}
.update-check > .error {
    color: var(--seal);
}
.update-check > .available {
    color: var(--moss);
}
</style>
