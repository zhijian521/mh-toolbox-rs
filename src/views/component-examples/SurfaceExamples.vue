<script setup lang="ts">
import { ref } from 'vue';
import {
    GlassButton,
    GlassCard,
    GlassGroup,
    GlassProgressiveBlur,
    GlassScene,
    GlassSegment,
    GlassSegmented,
    GlassSpacer,
    GlassToolbar,
} from '../../components/liquid-glass';
import AppIcon from '../../components/AppIcon.vue';
import TrendChart from '../../components/TrendChart.vue';
import CategoryBarChart from '../../components/CategoryBarChart.vue';
import GlassCompactPager from '../../components/liquid-glass/GlassCompactPager.vue';
import GlassTable from '../../components/liquid-glass/GlassTable.vue';
import { ledgerMoneyText, moneyText } from '../../services/format';
import type { GalleryExamples } from './gallery-examples';

const { samples } = defineProps<{ samples: GalleryExamples }>();
const {
    wallpaper,
    chartExample,
    sampleDays,
    sampleTrend,
    sampleSeries,
    sampleColors,
    sampleChannels,
    samplePage,
    sheetOpen,
    openSample,
    tableExamples,
    observations,
} = samples;
const timeline = ref<HTMLElement | null>(null);
</script>

<template>
    <section class="sample-chart">
        <header>
            <h3>图表</h3>
            <GlassSegmented
                v-model:value="chartExample"
                class="lg-status-tabs"
                data-size="compact"
                aria-label="图表示例"
            >
                <GlassSegment value="trend">趋势图</GlassSegment>
                <GlassSegment value="category">分类柱图</GlassSegment>
            </GlassSegmented>
        </header>
        <TrendChart
            v-if="chartExample === 'trend'"
            class="chart-in-card"
            :labels="sampleDays"
            :series="sampleTrend"
            :colors="sampleColors"
            kind="money"
            label="每日收支"
        />
        <CategoryBarChart
            v-else
            class="chart-in-card"
            :rows="sampleChannels"
            :series="sampleSeries"
            :value-text="(value) => ledgerMoneyText(value, 'rmb')"
            :axis-unit="1"
            label="渠道收支"
        />
    </section>
    <section>
        <header>
            <h3>表格</h3>
            <small>滚动时固定表头</small>
        </header>
        <div class="sample-table-scroll" tabindex="0" role="region" aria-label="滚动表格示例">
            <GlassTable sticky-header aria-label="示例物价记录">
                <thead>
                    <tr>
                        <th scope="col">物品</th>
                        <th scope="col">日期</th>
                        <th scope="col" data-align="end">价格</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="point in tableExamples" :key="point.date">
                        <td>{{ point.name }}</td>
                        <td>
                            <time :datetime="point.date">{{ point.date }}</time>
                        </td>
                        <td data-align="end">{{ moneyText(point.price) }}</td>
                    </tr>
                </tbody>
            </GlassTable>
        </div>
    </section>
    <section>
        <header><h3>紧凑分页</h3></header>
        <div class="stage">
            <GlassCompactPager v-model:page="samplePage" :pages="3" label="示例分页" />
        </div>
    </section>
    <section>
        <header><h3>工具栏</h3></header>
        <div class="stage">
            <GlassToolbar aria-label="价格工具栏">
                <span>金刚石</span><GlassSpacer />
                <GlassGroup aria-label="价格操作">
                    <GlassButton
                        size="small"
                        variant="plain"
                        shape="circle"
                        aria-label="查看示例历史"
                        @click="sheetOpen = true"
                        ><AppIcon name="history"
                    /></GlassButton>
                    <GlassButton
                        size="small"
                        variant="plain"
                        shape="circle"
                        aria-label="编辑示例价格"
                        @click="openSample('edit')"
                        ><AppIcon name="edit"
                    /></GlassButton>
                </GlassGroup>
            </GlassToolbar>
        </div>
    </section>
    <section>
        <header><h3>场景容器</h3></header>
        <GlassScene class="stage scene" :src="wallpaper"
            ><GlassCard :radius="15" class="scene-label">应用壁纸</GlassCard></GlassScene
        >
    </section>
    <section>
        <header><h3>滚动边缘</h3></header>
        <div class="stage scroll-stage">
            <div ref="timeline" class="timeline" tabindex="0" aria-label="操作记录">
                <GlassCard v-for="item in observations" :key="item" :radius="10">{{
                    item
                }}</GlassCard>
            </div>
            <GlassProgressiveBlur edge="top" :size="40" />
            <GlassToolbar class="timeline-bar" aria-label="记录工具栏">
                <span>操作记录</span><GlassSpacer /><GlassButton
                    size="small"
                    class="lg-inline-action"
                    @click="timeline?.scrollTo({ top: 0 })"
                    >回到顶部</GlassButton
                >
            </GlassToolbar>
        </div>
    </section>
</template>
