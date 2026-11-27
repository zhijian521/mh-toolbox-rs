<script setup lang="ts">
import {
    GlassSegment,
    GlassSegmented,
    GlassSlider,
    GlassSwitch,
    GlassTab,
    GlassTabBar,
} from '../../components/liquid-glass';
import AppIcon from '../../components/AppIcon.vue';
import GlassMultiSelect from '../../components/liquid-glass/GlassMultiSelect.vue';
import GlassSmallSwitch from '../../components/liquid-glass/GlassSmallSwitch.vue';
import type { GalleryExamples } from './gallery-examples';

const {
    smallAlerts,
    disabledAlerts,
    categories,
    checkboxOptions,
    alerts,
    threshold,
    currentTab,
    choiceExamples,
    checkboxCategories,
} = defineProps<{ samples: GalleryExamples }>().samples;
</script>

<template>
    <section>
        <header><h3>开关</h3></header>
        <div class="stage">
            <div class="setting-row">
                <span>价格提醒</span><output>{{ alerts ? '开启' : '关闭' }}</output
                ><GlassSwitch v-model:checked="alerts" aria-label="价格提醒" />
            </div>
        </div>
    </section>
    <section>
        <header>
            <h3>紧凑开关</h3>
            <small>常态 · 禁用</small>
        </header>
        <div class="stage stack">
            <div class="setting-row">
                <span>提醒示例</span><output>{{ smallAlerts ? '开启' : '关闭' }}</output>
                <GlassSmallSwitch v-model:checked="smallAlerts" aria-label="紧凑提醒示例" />
            </div>
            <div class="setting-row">
                <span>禁用示例</span><output>不可切换</output>
                <GlassSmallSwitch
                    v-model:checked="disabledAlerts"
                    disabled
                    aria-label="禁用提醒示例"
                />
            </div>
        </div>
    </section>
    <section>
        <header><h3>滑块</h3></header>
        <div class="stage">
            <div class="field-example">
                <div class="setting-row">
                    <span>提醒阈值</span><output>{{ threshold }} 万</output>
                </div>
                <GlassSlider v-model:value="threshold" :step="1" aria-label="提醒阈值（万）" />
            </div>
        </div>
    </section>
    <template v-for="example in choiceExamples" :key="example.size">
        <section>
            <header>
                <h3>{{ example.label }}分段选择</h3>
            </header>
            <div class="stage">
                <GlassSegmented
                    v-model:value="example.status"
                    class="lg-status-tabs"
                    :data-size="example.size"
                    :aria-label="example.label + '目标状态'"
                >
                    <GlassSegment value="active">进行中</GlassSegment>
                    <GlassSegment value="done">已达成</GlassSegment>
                    <GlassSegment value="all">全部</GlassSegment>
                </GlassSegmented>
            </div>
        </section>
        <section>
            <header>
                <h3>{{ example.label }}多选</h3>
            </header>
            <div class="stage">
                <GlassMultiSelect
                    v-model="example.categories"
                    :options="categories"
                    :size="example.size"
                    variant="segmented"
                    :label="example.label + '示例物品分类'"
                />
            </div>
        </section>
    </template>
    <section>
        <header><h3>复选多选</h3></header>
        <div class="stage">
            <GlassMultiSelect
                v-model="checkboxCategories"
                :options="checkboxOptions"
                label="示例复选分类"
            />
        </div>
    </section>
    <section>
        <header><h3>标签栏</h3></header>
        <div class="stage">
            <GlassTabBar v-model:value="currentTab" aria-label="示例导航">
                <GlassTab value="overview"><AppIcon name="overview" />概览</GlassTab>
                <GlassTab value="prices"><AppIcon name="prices" />物价</GlassTab>
                <GlassTab value="income"><AppIcon name="income" />收益</GlassTab>
            </GlassTabBar>
        </div>
    </section>
</template>
