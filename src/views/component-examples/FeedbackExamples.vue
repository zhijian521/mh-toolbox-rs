<script setup lang="ts">
import { GlassButton } from '../../components/liquid-glass';
import GlassEmptyState from '../../components/liquid-glass/GlassEmptyState.vue';
import { notify } from '../../composables/use-notify';
import type { GalleryExamples } from './gallery-examples';

const { samples } = defineProps<{ samples: GalleryExamples }>();
const { sheetOpen, openSample } = samples;
</script>

<template>
    <section>
        <header><h3>提示</h3></header>
        <div class="stage">
            <GlassButton
                size="small"
                class="sample-notice"
                @click="notify.info('这是一条顶部消息提示。')"
            >
                显示顶部提示
            </GlassButton>
        </div>
    </section>
    <section>
        <header><h3>对话框</h3></header>
        <div class="stage">
            <GlassButton size="small" @click="openSample('add')">打开记价表单</GlassButton>
        </div>
    </section>
    <section>
        <header><h3>底部弹层</h3></header>
        <div class="stage">
            <GlassButton size="small" aria-haspopup="dialog" @click="sheetOpen = true"
                >查看价格历史</GlassButton
            >
        </div>
    </section>
    <section>
        <header><h3>空状态</h3></header>
        <div class="stage"><GlassEmptyState /></div>
    </section>
</template>
