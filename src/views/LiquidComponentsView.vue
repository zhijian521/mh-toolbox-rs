<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { useRovingFocus } from '../composables/use-roving-focus';
import type { IconName } from '../components/icons';
import { GlassButton, GlassSheet } from '../components/liquid-glass';
import AppIcon from '../components/AppIcon.vue';
import GlassDialog from '../components/liquid-glass/GlassDialog.vue';
import LiquidPriceEditor from './prices/LiquidPriceEditor.vue';
import { moneyText } from '../services/format';
import CardExamples from './component-examples/CardExamples.vue';
import ActionExamples from './component-examples/ActionExamples.vue';
import InputExamples from './component-examples/InputExamples.vue';
import ChoiceExamples from './component-examples/ChoiceExamples.vue';
import SurfaceExamples from './component-examples/SurfaceExamples.vue';
import FeedbackExamples from './component-examples/FeedbackExamples.vue';
import { createGalleryExamples } from './component-examples/gallery-examples';

const catalogSections = [
    { key: 'cards', label: '卡片', icon: 'card', description: '内容表面、价格走势与卡内操作。' },
    {
        key: 'actions',
        label: '按钮与菜单',
        icon: 'dots',
        description: '行内操作、表单按钮与下拉菜单。',
    },
    {
        key: 'inputs',
        label: '输入控件',
        icon: 'edit',
        description: '紧凑与标准尺寸，以及错误、禁用状态。',
    },
    {
        key: 'choices',
        label: '选择控件',
        icon: 'settings',
        description: '开关、滑块、单选、多选与标签栏。',
    },
    {
        key: 'surfaces',
        label: '容器与表面',
        icon: 'grid',
        description: '表格、紧凑分页、工具栏与滚动区域。',
    },
    {
        key: 'feedback',
        label: '反馈与弹层',
        icon: 'info',
        description: '消息提示、表单弹窗、历史面板与空状态。',
    },
] as const satisfies readonly { key: string; label: string; icon: IconName; description: string }[];
type CatalogSection = (typeof catalogSections)[number]['key'];
const activeSection = ref<CatalogSection>('cards');
const activeGroup = computed(() =>
    catalogSections.find((item) => item.key === activeSection.value)!,
);
const panels = ref<HTMLElement[]>([]);
const gallery = computed(() =>
    panels.value.find((panel) => panel.id === 'catalog-panel-' + activeSection.value),
);
const scrollPositions = new Map<CatalogSection, number>();
async function selectSection(key: CatalogSection) {
    if (key === activeSection.value) return;
    scrollPositions.set(activeSection.value, gallery.value?.scrollTop ?? 0);
    activeSection.value = key;
    await nextTick();
    if (activeSection.value === key && gallery.value) {
        gallery.value.scrollTop = scrollPositions.get(key) ?? 0;
    }
}
const { cells, tabIndexFor, onKeydown } = useRovingFocus<CatalogSection>({
    values: () => catalogSections.map((item) => item.key),
    activeValue: () => activeSection.value,
    pick: (index) => {
        void selectSection(catalogSections[index].key);
    },
    axis: 'vertical',
});
const examples = {
    cards: CardExamples,
    actions: ActionExamples,
    inputs: InputExamples,
    choices: ChoiceExamples,
    surfaces: SurfaceExamples,
    feedback: FeedbackExamples,
};
const samples = createGalleryExamples();
const { sampleItem, history, sheetOpen, editorOpen, editingPoint, saveSample } = samples;
</script>

<template>
    <div class="component-catalog">
        <aside class="catalog-sidebar lg-scroll-hidden" aria-label="组件目录">
            <header class="catalog-heading">
                <span class="catalog-emblem"><AppIcon name="grid" /></span>
                <div>
                    <h1>组件展示</h1>
                    <p>Liquid Glass</p>
                </div>
            </header>
            <div
                class="catalog-menu"
                role="tablist"
                aria-label="组件分类"
                aria-orientation="vertical"
                @keydown="onKeydown"
            >
                <button
                    v-for="(section, index) in catalogSections"
                    :id="'catalog-tab-' + section.key"
                    :key="section.key"
                    ref="cells"
                    type="button"
                    role="tab"
                    class="catalog-menu-item"
                    :aria-selected="activeSection === section.key"
                    :aria-controls="'catalog-panel-' + section.key"
                    :tabindex="tabIndexFor(index)"
                    @click="selectSection(section.key)"
                >
                    <span class="catalog-menu-icon"><AppIcon :name="section.icon" /></span>
                    <span>{{ section.label }}</span>
                </button>
            </div>
            <p class="catalog-footnote">预览中的修改仅保留在当前页面。</p>
        </aside>
        <section class="catalog-detail" aria-labelledby="catalog-detail-title">
            <header class="catalog-detail-heading">
                <h2 id="catalog-detail-title">{{ activeGroup.label }}</h2>
                <p>{{ activeGroup.description }}</p>
            </header>
            <div
                v-for="section in catalogSections"
                :id="'catalog-panel-' + section.key"
                :key="section.key"
                ref="panels"
                :class="{ 'gallery lg-scroll-hidden': section.key === activeSection }"
                :hidden="section.key !== activeSection"
                role="tabpanel"
                :aria-labelledby="'catalog-tab-' + section.key"
                :tabindex="section.key === activeSection ? 0 : -1"
            >
                <!-- 示例值由页面保存；只挂载当前分类，避免玻璃控件在隐藏状态测量到零宽。 -->
                <component
                    :is="examples[section.key]"
                    v-if="section.key === activeSection"
                    :samples="samples"
                />
            </div>
        </section>
        <GlassDialog v-model:open="editorOpen" :label="editingPoint ? '编辑示例价格' : '示例记价'">
            <LiquidPriceEditor
                v-if="editorOpen"
                :item="sampleItem"
                :point="editingPoint"
                prefill-current
                :categories="[]"
                active
                :saving="false"
                :locked="false"
                :retrying="false"
                error=""
                @save="saveSample"
                @cancel="editorOpen = false"
            />
        </GlassDialog>
        <GlassSheet
            v-model:open="sheetOpen"
            class="sample-history"
            detents="small medium"
            aria-label="示例价格历史"
            modal
        >
            <div class="sheet-content">
                <header>
                    <h2>金刚石 · 价格历史</h2>
                    <GlassButton size="small" @click="sheetOpen = false">关闭</GlassButton>
                </header>
                <ol>
                    <li v-for="point in history" :key="point.id">
                        <time :datetime="point.date">{{ point.date }}</time
                        >{{ moneyText(point.price) }}
                    </li>
                </ol>
            </div>
        </GlassSheet>
    </div>
</template>

<style scoped src="./liquid-components.css"></style>
