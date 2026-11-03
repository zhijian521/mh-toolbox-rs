<script setup lang="ts">
import ConfirmDialog from './ConfirmDialog.vue';
import { useConfirmState } from '../composables/use-confirm';

/**
 * 全站唯一的二次确认宿主。挂在 `App.vue` 里，只写一次，页面不再自己渲染确认窗。
 *
 * 这个文件薄到只剩两行绑定，是故意的：**它不该有 props、也不该有分支**。
 * 一旦哪天这里出现「这个窗宽一点 / 那个窗不给取消」，`askConfirm()` 就不再是同一件东西了，
 * 而「所有二次确认一个样」正是这次把三处调用收拢过来的唯一理由。
 *
 * 页面侧的用法：
 *
 * ```ts
 * if (!(await askConfirm({ title: '清空所有角色与物价？', confirmText: '清除' }))) return;
 * ```
 */
const { pending, settle } = useConfirmState();
</script>

<template>
    <!-- 只渲染「有没有」，不渲染「长什么样」——形态全在 `ConfirmDialog` 里。
         `v-if` 收窄之后，`pending.*` 三行不必各写一次空值兜底。 -->
    <ConfirmDialog
        v-if="pending"
        :title="pending.title"
        :note="pending.note"
        :confirm-text="pending.confirmText"
        @confirm="settle(true)"
        @cancel="settle(false)"
    />
</template>
