<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '../components/PageHeader.vue';
import { DEFAULT_PATH } from '../navigation';

/**
 * 未实现页面的占位。
 *
 * 不做成「每页一个空文件」：七个占位页写七份一样的模板，改文案要改七处。
 * 标题从路由 `meta.title` 取，加页面时 `navigation.ts` 里把 `view` 填上就自动切换过来。
 */
const route = useRoute();
const router = useRouter();

const title = computed(() => String(route.meta.title ?? ''));
</script>

<template>
    <PageHeader :title="title" desc="这一页还没开始">
        <span class="hint">当前阶段只做设置页</span>
    </PageHeader>
    <div class="page-content">
        <div class="placeholder">
            <p>「{{ title }}」还没开始。</p>
            <p class="hint">先把设计语言落到真实组件上，再按页推进。</p>
            <button class="btn" type="button" @click="router.push(DEFAULT_PATH)">回到设置</button>
        </div>
    </div>
</template>

<style scoped>
.placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 100%;
    color: var(--muted);
}
</style>
