<script setup lang="ts">
import { nextTick, ref } from 'vue';
import AppIcon from '../../components/AppIcon.vue';
import { GlassMenu, GlassMenuItem } from '../../components/liquid-glass';

defineProps<{ label: string; record?: boolean; disabled: boolean }>();
const emit = defineEmits<{ edit: []; remove: [] }>();
const menu = ref<{ el: HTMLElement | null } | null>(null);

async function select(action: string) {
    // select 先于菜单收起触发。等玻璃面板淡出，再让下一层弹窗接管焦点。
    await nextTick();
    const host = menu.value?.el;
    const panel = host?.shadowRoot?.querySelector('[part="panel"]');
    const fade = panel?.getAnimations().find(
        (animation) => animation instanceof CSSTransition && animation.transitionProperty === 'opacity',
    );
    if (fade) {
        try {
            await fade.finished;
        } catch {
            // 用户在淡出中重新展开，取消上一次选择。
            return;
        }
    }
    if (!host?.isConnected || host.hasAttribute('open')) return;
    if (action === 'remove') emit('remove');
    if (action === 'edit') emit('edit');
}
</script>

<template>
    <span
        class="price-more"
        @toggle.stop
        @keydown.esc="$event.defaultPrevented && $event.stopPropagation()"
    >
        <GlassMenu
            ref="menu"
            class="lg-popup-menu lg-popup-menu-small"
            placement="bottom-start"
            @select="select"
        >
            <template #trigger>
                <button
                    type="button"
                    class="lg-popup-trigger"
                    :aria-label="label"
                    :title="label"
                    :disabled="disabled"
                >
                    <AppIcon name="dots" />
                </button>
            </template>
            <GlassMenuItem v-if="!record" value="edit"
                >编辑物品<AppIcon slot="icon" name="edit"
            /></GlassMenuItem>
            <GlassMenuItem value="remove" destructive
                >{{ record ? '删除此条记录' : '删除物品' }}<AppIcon slot="icon" name="trash"
            /></GlassMenuItem>
        </GlassMenu>
    </span>
</template>

<style scoped>
.price-more {
    display: inline-flex;
    --icon-size: 15px;
}
.price-more .lg-popup-trigger {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
}
.price-more glass-menu-item [slot='icon'] {
    width: 14px;
    height: 14px;
    opacity: 0.8;
}
</style>
