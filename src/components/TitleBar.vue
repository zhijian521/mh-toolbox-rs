<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { getCurrentWindow } from '@tauri-apps/api/window';
import AppIcon from './AppIcon.vue';
import SealMark from './SealMark.vue';

/**
 * 自绘标题栏。
 *
 * 系统标题栏在这套纸面语言里是异物：Windows 会给它一条蓝色标题栏和三个系统按钮，
 * 浅色下与宣纸底打架，深色下又与纸面同色读不出边界。所以窗口改成无边框
 * （`decorations(false)`），标题栏由我们自己画：一条账线、一枚印、三个细笔按钮。
 *
 * 三个技术点：
 * 1. 拖动靠 `data-tauri-drag-region`，且**每个可点的文字块都要单独标**——只标父元素时，
 *    点在子元素文字上不会触发拖动。
 * 2. 最大化状态要监听 `onResized` 回读 `isMaximized()`：双击拖动区最大化、拖边还原，
 *    这些都不经过我们的按钮，状态会漂。
 * 3. 浏览器里（`npm run dev` 无 Tauri）没有窗口 API，按钮退化成空操作，页面照样能看。
 */
const hasTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const appWindow = hasTauri ? getCurrentWindow() : null;

const maximized = ref(false);
let unlisten: (() => void) | null = null;

onMounted(async () => {
    if (!appWindow) return;
    maximized.value = await appWindow.isMaximized();
    unlisten = await appWindow.onResized(async () => {
        maximized.value = await appWindow.isMaximized();
    });
});

onBeforeUnmount(() => unlisten?.());

const minimize = () => void appWindow?.minimize();
const toggleMaximize = () => void appWindow?.toggleMaximize();
const close = () => void appWindow?.close();
</script>

<template>
    <header class="titlebar" data-tauri-drag-region>
        <div class="brand" data-tauri-drag-region>
            <SealMark text="梦" :size="20" />
            <span class="brand-name" data-tauri-drag-region>梦幻养老助手</span>
            <span class="brand-tag" data-tauri-drag-region>RUST · V0.1</span>
        </div>
        <div class="drag-space" data-tauri-drag-region />
        <div class="actions">
            <button class="tb-btn" type="button" title="最小化" @click="minimize">
                <AppIcon name="minimize" :size="13" />
            </button>
            <button
                class="tb-btn"
                type="button"
                :title="maximized ? '还原' : '最大化'"
                @click="toggleMaximize"
            >
                <AppIcon :name="maximized ? 'restore' : 'maximize'" :size="13" />
            </button>
            <button class="tb-btn close" type="button" title="关闭" @click="close">
                <AppIcon name="close" :size="13" />
            </button>
        </div>
    </header>
</template>

<style scoped>
.titlebar {
    display: flex;
    align-items: center;
    flex: none;
    height: calc(36px * var(--fs-scale));
    padding-left: 12px;
    border-bottom: var(--w-hair) solid var(--rule);
    background: var(--paper);
    /* 无边框窗口下，标题栏是唯一能拖动的地方，给个明确的抓手光标。 */
    cursor: default;
    user-select: none;
}
.brand {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}
.brand-name {
    color: var(--ink);
    font-size: var(--fs-sm);
    letter-spacing: 0.04em;
    white-space: nowrap;
}
.brand-tag {
    color: var(--muted);
    font-size: var(--fs-mini);
    letter-spacing: 0.16em;
    white-space: nowrap;
}
.drag-space {
    flex: 1;
    align-self: stretch;
    min-width: 40px;
}
.actions {
    display: flex;
    align-self: stretch;
}
/* 三个窗口按钮：细笔画方形，之间只有一条账线，不做圆角也不做阴影。 */
.tb-btn {
    display: grid;
    place-items: center;
    width: calc(42px * var(--fs-scale));
    height: 100%;
    border: 0;
    border-left: var(--w-hair) solid var(--rule);
    background: none;
    color: var(--muted);
    transition:
        background-color var(--t-quick) var(--ease-soft),
        color var(--t-quick) var(--ease-soft);
}
.tb-btn:hover {
    background: var(--paper-2);
    color: var(--ink);
}
.tb-btn:active {
    background: color-mix(in srgb, var(--well) 70%, var(--paper-2));
}
/* 关闭是唯一灌朱的窗口按钮：与「支出」同一条语义（会造成损失的动作）。 */
.tb-btn.close:hover {
    border-left-color: var(--cinnabar-ink);
    background: var(--cinnabar);
    color: var(--on-cinnabar);
}
.tb-btn.close:active {
    background: var(--cinnabar-ink);
}
</style>
