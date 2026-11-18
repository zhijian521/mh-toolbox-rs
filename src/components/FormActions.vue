<script setup lang="ts">
/** 表单页脚只统一展示，草稿保护、保存和重试仍由业务窗口决定。 */
import PressButton from './PressButton.vue';
import type { IconName } from './icons';

withDefaults(
    defineProps<{
        error?: string;
        errorRole?: 'status' | 'alert';
        cancelText?: string;
        cancelLabel?: string;
        cancelIcon?: IconName;
        cancelDisabled?: boolean;
        submitText?: string;
        submitLabel: string;
        submitIcon?: IconName | '';
        submitDisabled?: boolean;
        submitDescribedby?: string;
    }>(),
    {
        error: '',
        errorRole: 'status',
        cancelText: '取消',
        cancelLabel: '取消',
        submitText: '保存',
        submitIcon: 'check',
    },
);
const emit = defineEmits<{ cancel: []; submit: [] }>();
</script>

<template>
    <!-- 保留为片段，业务插槽与按钮仍是 modal-actions 的直接子项。 -->
    <slot name="before" />
    <p v-if="error" class="note error save-error" :role="errorRole">{{ error }}</p>
    <slot />
    <PressButton
        data-modal-cancel
        :text="cancelText"
        :label="cancelLabel"
        :icon="cancelIcon"
        :disabled="cancelDisabled"
        @click="emit('cancel')"
    />
    <slot name="submit">
        <PressButton
            :icon="submitIcon || undefined"
            :text="submitText"
            :label="submitLabel"
            :disabled="submitDisabled"
            :aria-describedby="submitDescribedby"
            seal
            @click="emit('submit')"
        />
    </slot>
</template>
