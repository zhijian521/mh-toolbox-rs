<script setup lang="ts">
import { shallowRef, watch } from 'vue';
import { useConfirmState, type ConfirmOptions } from '../../composables/use-confirm';
import GlassDialog from './GlassDialog.vue';
import { GlassButton } from './index';

const { pending, settle } = useConfirmState();
const content = shallowRef<ConfirmOptions>();
watch(pending, (request) => {
    if (request) content.value = request;
}, { immediate: true });
</script>

<template>
    <GlassDialog
        v-if="content"
        :open="!!pending"
        :label="content.title"
        detents="medium large"
        @update:open="!$event && settle(false)"
    >
        <section class="glass-confirm" @pointerdown.stop>
            <h2>{{ content.title }}</h2>
            <p v-if="content.note">{{ content.note }}</p>
            <footer>
                <GlassButton v-if="content.cancelText" size="small" variant="plain" @click="settle(false)">
                    {{ content.cancelText }}
                </GlassButton>
                <GlassButton size="small" :class="{ danger: content.danger }" @click="settle(true)">
                    {{ content.confirmText }}
                </GlassButton>
            </footer>
        </section>
    </GlassDialog>
</template>

<style scoped>
.glass-confirm {
    /* 与备份 / 壁纸 / 价格编辑器弹窗同一口径：面板半透明，
     * 按钮文字用页面墨色，不叠玻璃材质的浅色描边。 */
    --glass-foreground: var(--liquid-ink);
    --glass-accent-text: var(--liquid-ink);
}
.glass-confirm glass-button {
    letter-spacing: normal;
}
.glass-confirm h2 {
    margin: 0;
}
.glass-confirm p {
    margin: 10px 0;
    white-space: pre-line;
    overflow-wrap: anywhere;
}
.glass-confirm footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
}
.glass-confirm .danger {
    --glass-foreground: var(--liquid-up);
}
</style>
