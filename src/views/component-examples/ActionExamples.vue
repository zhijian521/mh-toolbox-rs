<script setup lang="ts">
import {
    GlassButton,
    GlassMenu,
    GlassMenuItem,
    GlassMenuLabel,
    GlassMenuSeparator,
    GlassSegment,
    GlassSegmented,
} from '../../components/liquid-glass';
import AppIcon from '../../components/AppIcon.vue';
import GlassMenuTrigger from '../../components/liquid-glass/GlassMenuTrigger.vue';
import type { GalleryExamples } from './gallery-examples';

const { samples } = defineProps<{ samples: GalleryExamples }>();
const { sheetOpen, openSample, sort } = samples;
</script>

<template>
    <section>
        <header>
            <h3>按钮</h3>
            <small>行内 · 表单</small>
        </header>
        <div class="stage stack">
            <div class="example-row">
                <span class="sample-label">卡内操作</span>
                <GlassButton
                    size="small"
                    class="lg-inline-action"
                    variant="plain"
                    @click="sheetOpen = true"
                    >历史</GlassButton
                >
                <GlassButton size="small" class="lg-inline-action" @click="openSample('add')"
                    >记价</GlassButton
                >
            </div>
            <div class="example-row">
                <span class="sample-label">表单操作</span>
                <GlassButton size="small" @click="openSample('edit')">编辑价格</GlassButton>
                <GlassButton
                    size="small"
                    shape="circle"
                    aria-label="新增价格记录"
                    @click="openSample('add')"
                    ><AppIcon name="add"
                /></GlassButton>
            </div>
        </div>
    </section>
    <section>
        <header><h3>菜单</h3></header>
        <div class="stage">
            <GlassMenu
                class="lg-popup-menu lg-select-menu lg-form-fields"
                @select="
                    typeof $event === 'string' && (sort = $event === 'reset' ? '名称' : $event)
                "
            >
                <template #trigger>
                    <GlassMenuTrigger :text="'按' + sort + '排序'" aria-label="选择排序方式" />
                </template>
                <GlassMenuLabel>排序方式</GlassMenuLabel>
                <GlassMenuItem
                    v-for="option in ['名称', '时间']"
                    :key="option"
                    :value="option"
                    group="sort"
                    checkable
                    :checked="sort === option"
                    >{{ option }}</GlassMenuItem
                >
                <GlassMenuSeparator /><GlassMenuItem value="reset">恢复默认</GlassMenuItem>
            </GlassMenu>
        </div>
    </section>
    <section class="field-comparison">
        <header><h3>主题状态</h3></header>
        <div class="comparison-grid">
            <div
                v-for="scheme in ['light', 'dark']"
                :key="scheme"
                class="sample-theme"
                :style="{ colorScheme: scheme, '--lg-appearance': scheme }"
            >
                <small class="sample-label">{{ scheme === 'light' ? '浅色' : '深色' }}</small>
                <GlassSegmented
                    value="selected"
                    data-size="compact"
                    :aria-label="scheme === 'light' ? '浅色状态' : '深色状态'"
                >
                    <GlassSegment value="selected">选中</GlassSegment>
                    <GlassSegment value="ready">可选</GlassSegment>
                </GlassSegmented>
                <GlassButton size="small" class="sample-focus">焦点</GlassButton>
                <GlassButton size="small" disabled>禁用</GlassButton>
            </div>
        </div>
    </section>
</template>
