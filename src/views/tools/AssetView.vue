<script setup lang="ts">
import { computed, inject, onMounted, ref, watch } from 'vue';
import { glassLedger } from '../../components/glass-ledger';
import { GlassCard } from '../../components/liquid-glass';
import GlassInput from '../../components/liquid-glass/GlassInput.vue';
import GlassSelect from '../../components/liquid-glass/GlassSelect.vue';
import AppIcon from '../../components/AppIcon.vue';
import GroupHead from '../../components/GroupHead.vue';
import RecordPager from '../../components/RecordPager.vue';
import ModalShell from '../../components/ModalShell.vue';
import ToolPageShell from './ToolPageShell.vue';
import PressButton from '../../components/PressButton.vue';
import SelectField from '../../components/SelectField.vue';
import {
    filterAssets,
    loadAssetSections,
    type AssetItem,
    type AssetSection,
} from '../../services/game-assets';
import AssetImage from './AssetImage.vue';

/** 图鉴先筛全部索引，再切分页；图片懒加载不能代替对 DOM 数量的限制。 */
const PAGE_SIZE = 120;
const glass = inject(glassLedger, null);
const sections = ref<AssetSection[]>([]);
const loading = ref(false);
const failed = ref(false);
const keyword = ref('');
const kind = ref('weapon');
const subgroup = ref('all');
const level = ref('all');
const page = ref(1);
const preview = ref<AssetItem | null>(null);
const imageVersion = ref(0);
const previewVersion = ref(0);

async function load() {
    if (loading.value) return;
    loading.value = true;
    failed.value = false;
    const initial = sections.value.length === 0;
    try {
        const next = await loadAssetSections();
        // 首次打开避开空分类；重试保留用户选择，成功后直接补回原位置。
        if (initial && !next.some((one) => one.kind === kind.value && one.items.length)) {
            kind.value = next.find((one) => one.items.length)?.kind ?? kind.value;
        }
        sections.value = next;
        imageVersion.value++;
    } catch {
        failed.value = true;
    } finally {
        loading.value = false;
    }
}
onMounted(load);

const kindOptions = computed(() => [
    { value: 'all', label: '全部分类' },
    ...sections.value.map((one) => ({ value: one.kind, label: one.title })),
]);
const current = computed(() => sections.value.find((one) => one.kind === kind.value));
const subgroupOptions = computed(() => [
    { value: 'all', label: '全部分组' },
    ...[...new Set(current.value?.items.map((one) => one.subgroup).filter(Boolean) ?? [])].map(
        (name) => ({ value: name, label: name }),
    ),
]);
const levelOptions = computed(() => [
    { value: 'all', label: '全部等级' },
    ...[
        ...new Set(
            current.value?.items.flatMap((one) => (one.level === undefined ? [] : [one.level])) ??
                [],
        ),
    ]
        .sort((a, b) => a - b)
        .map((value) => ({ value: String(value), label: `${value} 级` })),
]);
watch(
    kind,
    () => {
        subgroup.value = 'all';
        level.value = 'all';
    },
    { flush: 'sync' },
);
watch(
    [kind, keyword, subgroup, level],
    () => {
        page.value = 1;
    },
    { flush: 'sync' },
);

const filtered = computed(() =>
    filterAssets(sections.value, {
        kind: kind.value,
        keyword: keyword.value,
        subgroup: subgroup.value === 'all' ? undefined : subgroup.value,
        level: level.value === 'all' ? undefined : Number(level.value),
    }),
);
const total = computed(() => filtered.value.reduce((sum, one) => sum + one.items.length, 0));
const pages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)));
const currentPage = computed(() => Math.min(page.value, pages.value));
const start = computed(() => (currentPage.value - 1) * PAGE_SIZE);
const end = computed(() => Math.min(start.value + PAGE_SIZE, total.value));

const visible = computed(() => {
    let offset = 0;
    return filtered.value.flatMap((section) => {
        const items = section.items.slice(
            Math.max(0, start.value - offset),
            Math.max(0, end.value - offset),
        );
        offset += section.items.length;
        if (!items.length) return [];
        const groups = new Map<string, AssetItem[]>();
        for (const item of items) {
            const group = groups.get(item.subgroup) ?? [];
            group.push(item);
            groups.set(item.subgroup, group);
        }
        return [
            {
                ...section,
                groups: [...groups].map(([name, entries]) => ({ name, items: entries })),
                summary:
                    items.length === section.items.length
                        ? `${section.items.length} 项`
                        : `本页 ${items.length} / ${section.items.length} 项`,
            },
        ];
    });
});
const unavailable = computed(() => sections.value.filter((one) => one.status === 'failed'));
const missingHere = computed(() =>
    unavailable.value.some((one) => kind.value === 'all' || one.kind === kind.value),
);
const hasFilters = computed(
    () => !!keyword.value.trim() || subgroup.value !== 'all' || level.value !== 'all',
);
const warningText = computed(() =>
    failed.value
        ? '资源清单加载失败。'
        : `未加载：${unavailable.value.map((one) => one.title).join('、')}`,
);
const countText = computed(() => {
    if (loading.value) return '正在加载…';
    return `${hasFilters.value ? '找到' : '共'} ${total.value} 项`;
});
const emptyTitle = computed(() => {
    if (failed.value) return '资源清单未能加载';
    if (missingHere.value) return '当前范围有资源未加载';
    return hasFilters.value ? '没有匹配的资源' : '这个分类暂无资源';
});
const previewSection = computed(() =>
    sections.value.find((one) => one.kind === preview.value?.kind),
);
const emptyDescription = computed(() => {
    if (failed.value || missingHere.value) return '请重试加载资源后再查看。';
    return hasFilters.value ? '换个关键词，或清除筛选后查看。' : '可以切换其他分类查看。';
});

function clearFilters() {
    keyword.value = '';
    subgroup.value = 'all';
    level.value = 'all';
}
function turnPage(next: number) {
    page.value = Math.max(1, Math.min(next, pages.value));
    // 页面内容滚动，不滚窗口外壳；焦点留在翻页按钮上，连续翻页不丢位置。
    document.querySelector('.page-content, .liquid-content')?.scrollTo({ top: 0, behavior: 'instant' });
}
</script>

<template>
    <ToolPageShell
        title="游戏资源"
        desc="图标检索 · 图鉴预览"
        class="asset-page"
        :class="{ 'is-glass': glass }"
    >
        <div class="asset-bar page-filters" :class="{ 'lg-form-fields': glass }">
            <GlassInput v-if="glass" class="asset-search">
                <AppIcon name="search" />
                <input
                    v-model="keyword"
                    type="search"
                    aria-label="搜索资源名"
                    :placeholder="
                        kind === 'all' ? '搜索全部资源、名称或别名' : '搜索当前分类、名称或别名'
                    "
                />
            </GlassInput>
            <input
                v-else
                v-model="keyword"
                class="field filter-search"
                type="search"
                aria-label="搜索资源名"
                :placeholder="
                    kind === 'all' ? '搜索全部资源、名称或别名' : '搜索当前分类、名称或别名'
                "
            />
            <component
                :is="glass ? GlassSelect : SelectField"
                v-model="kind"
                class="asset-kind"
                :options="kindOptions"
                label="按类别筛选"
                :hide-label="!!glass"
                :disabled="!sections.length"
            />
            <component
                :is="glass ? GlassSelect : SelectField"
                v-if="kind !== 'all' && subgroupOptions.length > 1"
                v-model="subgroup"
                class="asset-filter"
                :options="subgroupOptions"
                label="按分组筛选"
                :hide-label="!!glass"
            />
            <component
                :is="glass ? GlassSelect : SelectField"
                v-if="kind !== 'all' && levelOptions.length > 1"
                v-model="level"
                class="asset-filter"
                :options="levelOptions"
                label="按等级筛选"
                :hide-label="!!glass"
            />
            <PressButton v-if="hasFilters" text="清除" label="清除资源筛选" @click="clearFilters" />
            <span class="asset-count" role="status">{{ countText }}</span>
        </div>

        <div v-if="unavailable.length || failed" class="asset-warning" role="status">
            <span>{{ warningText }}</span>
            <PressButton text="重试" label="重试加载资源" :disabled="loading" @click="load" />
        </div>

        <div v-if="loading && !sections.length" class="asset-void page-empty" role="status">
            <AppIcon name="grid" class="page-empty-icon" />
            <h3>正在加载资源</h3>
        </div>

        <component
            :is="glass ? GlassCard : 'section'"
            v-for="section in visible"
            :key="section.kind"
            class="asset-section"
            :class="{ 'board board-plain': !glass }"
            :radius="glass ? 20 : undefined"
            :role="glass ? 'region' : undefined"
            :aria-label="section.title"
        >
            <header class="asset-head">
                <h3 class="asset-title">{{ section.title }}</h3>
                <span class="asset-total">{{ section.summary }}</span>
            </header>
            <div v-for="group in section.groups" :key="group.name" class="asset-group">
                <GroupHead v-if="group.name" as="h4" class="asset-sub">
                    <span>{{ group.name }}</span>
                </GroupHead>
                <ul class="asset-grid">
                    <li v-for="item in group.items" :key="item.key">
                        <button
                            type="button"
                            class="asset-cell"
                            :title="[item.name, item.note].filter(Boolean).join(' · ')"
                            :aria-label="`查看${item.name}大图`"
                            @click="preview = item"
                        >
                            <AssetImage :key="imageVersion" :src="item.img" :name="item.name" />
                            <span class="asset-name">{{ item.name }}</span>
                            <span v-if="item.note" class="asset-meta">{{ item.note }}</span>
                        </button>
                    </li>
                </ul>
            </div>
        </component>

        <RecordPager
            class="asset-pages"
            :model-value="currentPage"
            :pages="pages"
            label="资源分页"
            previous-label="资源上一页"
            next-label="资源下一页"
            @update:model-value="turnPage"
        >
            <span class="asset-page-info">
                {{ currentPage }} / {{ pages }} 页 · {{ start + 1 }}–{{ end }} 项
            </span>
        </RecordPager>

        <div v-if="!loading && !visible.length" class="asset-void page-empty">
            <AppIcon :name="failed || missingHere ? 'info' : 'search'" class="page-empty-icon" />
            <h3>{{ emptyTitle }}</h3>
            <p class="note">{{ emptyDescription }}</p>
            <PressButton
                v-if="hasFilters && !failed && !missingHere"
                text="清除筛选"
                label="清除无结果筛选"
                @click="clearFilters"
            />
        </div>

        <ModalShell
            v-if="preview"
            :title="preview.name"
            :width="420"
            initial-focus="cancel"
            @close="preview = null"
        >
            <div class="asset-preview" :class="{ 'is-glass': glass }">
                <AssetImage :key="previewVersion" :src="preview.img" :name="preview.name" eager />
                <dl class="asset-details">
                    <dt>分类</dt>
                    <dd>{{ previewSection?.title }}</dd>
                    <template v-if="preview.subgroup">
                        <dt>分组</dt>
                        <dd>{{ preview.subgroup }}</dd>
                    </template>
                    <template v-if="preview.note">
                        <dt>说明</dt>
                        <dd>{{ preview.note }}</dd>
                    </template>
                </dl>
            </div>
            <template #footer>
                <PressButton text="重试图片" label="重试预览图片" @click="previewVersion++" />
                <PressButton
                    text="关闭"
                    label="关闭资源预览"
                    data-modal-cancel
                    @click="preview = null"
                />
            </template>
        </ModalShell>
    </ToolPageShell>
</template>

<style scoped>
/* SelectField 默认 flex: 1，图鉴筛选应按自身内容宽度换行。 */
.asset-bar .asset-kind,
.asset-bar .asset-filter {
    flex: 0 1 calc(140px * var(--fs-scale));
    min-width: 0;
}
.asset-count,
.asset-page-info {
    color: var(--muted);
    font-size: var(--fs-xs);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
.asset-count {
    margin-left: auto;
}
.asset-warning {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    color: var(--muted);
    font-size: var(--fs-sm);
}
.asset-section {
    padding: 14px 16px 16px;
}
.asset-section + .asset-section {
    margin-top: 12px;
}
.asset-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 10px;
}
.asset-title {
    margin: 0;
    font-size: var(--fs-md);
}
.asset-total {
    color: var(--muted);
    font-size: var(--fs-mini);
}
.asset-sub {
    margin: 12px 0 8px;
    color: var(--muted);
    font-size: var(--fs-xs);
    font-weight: 400;
    white-space: nowrap;
}
.asset-group:first-of-type .asset-sub {
    margin-top: 0;
}
.asset-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, calc(88px * var(--fs-scale))), 1fr));
    gap: 8px 6px;
    margin: 0;
    padding: 0;
    list-style: none;
}
.asset-grid > li {
    min-width: 0;
}
/* 原图自带底板时不再叠一层凹槽，保持图标墙的轻密度。 */
.asset-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 100%;
    height: 100%;
    padding: 6px 3px;
    border: 0;
    border-radius: var(--r-2);
    background: transparent;
    text-align: center;
    cursor: pointer;
    transition: background-color var(--t-quick) var(--ease-soft);
}
.asset-cell:hover {
    background: color-mix(in srgb, var(--seal) 7%, transparent);
}
.asset-name {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
    width: 100%;
    color: var(--ink-2);
    font-size: var(--fs-mini);
    line-height: 1.4;
    overflow-wrap: anywhere;
}
.asset-meta {
    color: var(--muted);
    font-size: var(--fs-mini);
    line-height: 1.3;
}
.asset-pages {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin: 16px 0 0;
}
.asset-preview {
    --asset-image-size: min(180px, 45vw);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
}
.asset-details {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 8px 16px;
    width: 100%;
    margin: 0;
    font-size: var(--fs-sm);
}
.asset-details dt {
    color: var(--muted);
}
.asset-details dd {
    margin: 0;
    overflow-wrap: anywhere;
}

.is-glass .asset-bar {
    align-items: center;
    gap: 10px;
    margin-bottom: 18px;
}
.asset-search {
    --icon-size: 16px;
    flex: 0 1 290px;
    width: min(290px, 100%);
    color: var(--liquid-muted);
}
.asset-search input {
    color: var(--liquid-ink);
}
.is-glass .asset-count {
    padding-block: 6px;
}
.is-glass .asset-section {
    display: block;
    padding: 20px;
}
.is-glass .asset-section + .asset-section {
    margin-top: 16px;
}
.is-glass .asset-head {
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 16px;
}
.is-glass .asset-title {
    font-size: var(--fs-md);
    font-weight: 400;
}
.is-glass .asset-total {
    font-size: var(--fs-xs);
}
.is-glass .asset-sub {
    margin-block: 18px 10px;
    font-size: var(--fs-sm);
}
.is-glass .asset-group:first-of-type .asset-sub {
    margin-top: 0;
}
.is-glass .asset-grid {
    grid-template-columns: repeat(auto-fill, minmax(min(100%, calc(100px * var(--fs-scale))), 1fr));
    gap: 10px 8px;
}
.is-glass .asset-cell {
    --asset-image-size: calc(60px * var(--fs-scale));
    gap: 7px;
    padding: 12px 6px;
    border-radius: 14px;
}
.is-glass .asset-cell:hover {
    background: var(--ledger-highlight);
}
.is-glass .asset-cell:focus-visible {
    outline: 2px solid var(--liquid-focus);
    outline-offset: -2px;
    background: var(--ledger-selected);
}
.is-glass .asset-name {
    font-size: var(--fs-xs);
    line-height: 1.5;
}
.is-glass .asset-meta {
    font-size: var(--fs-mini);
}
.is-glass .asset-pages {
    justify-content: space-between;
    margin-top: 18px;
    padding-inline: 4px;
}
.asset-preview.is-glass {
    gap: 24px;
    padding-top: 8px;
}
.asset-preview.is-glass .asset-details {
    gap: 12px 20px;
    padding-top: 18px;
    border-top: 1px solid var(--liquid-outline);
}
</style>
