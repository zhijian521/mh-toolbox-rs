<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageShell from '../components/PageShell.vue';
import SlotButton from '../components/SlotButton.vue';
import { DEFAULT_PATH } from '../navigation';

/**
 * 未实现页面的占位。
 *
 * 不做成「每页一个空文件」：五个占位页写五份一样的模板，改文案要改五处。
 * 标题从路由 `meta.title` 取，加页面时 `navigation.ts` 里把 `view` 填上就自动切换过来。
 *
 * 页头那句提示不再写「当前阶段只做设置页」——角色、工具、捉鬼都已经在跑了，
 * 再写就是指着界面上已经存在的东西说它不存在。改说「还没实现」这类恒真的话，
 * 免得每完成一页就要回来改一次文案。
 */
const route = useRoute();
const router = useRouter();

const title = computed(() => route.meta.title);
</script>

<template>
    <PageShell :title="title" desc="这一页还没开始">
        <div class="placeholder">
            <p>「{{ title }}」还没开始。</p>
            <p class="hint">工具与角色已经通了，这一页排在后面。</p>
            <SlotButton
                icon="back"
                text="回到设置"
                label="回到设置页"
                @click="router.push(DEFAULT_PATH)"
            />
        </div>
    </PageShell>
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
