<script setup lang="ts">
import { computed } from 'vue';
import { GlassButton, GlassCard } from '../../components/liquid-glass';
import { sparkLinePoints } from './price-chart-path';
import { moneyText } from '../../services/format';
import {
    currentPoint,
    priceBadge,
    recentPrices,
    sortedPoints,
    updateSummary,
    type ReadonlyPriceItem,
} from './prices';

const props = defineProps<{ item: ReadonlyPriceItem; editDisabled?: boolean }>();
const emit = defineEmits<{ history: []; record: [] }>();
const points = computed(() => sortedPoints(props.item));
const current = computed(() => currentPoint(props.item, points.value));
const change = computed(() => priceBadge(props.item, points.value));
const recent = computed(() => recentPrices(props.item, 8, points.value));
const spark = computed(() => sparkLinePoints(recent.value, 58, 18));
const summary = computed(() =>
    current.value ? updateSummary(props.item, points.value) : '暂无记录',
);
</script>

<template>
    <GlassCard class="price-card" :data-category="item.category" :radius="15">
        <header class="price-card-header">
            <div class="price-card-heading">
                <h2>{{ item.name }}</h2>
                <p class="lg-caption">
                    <span class="price-category">{{ item.category }}</span>
                    <template v-if="item.sub">
                        / <span class="price-subcategory">{{ item.sub }}</span>
                    </template>
                </p>
            </div>
            <slot name="actions" />
        </header>
        <div class="price-quote" :data-tone="change?.tone">
            <span v-if="current" class="price-value">{{ moneyText(current.price) }}</span>
            <span v-else class="price-unpriced">未记价</span>
            <span v-if="change" class="price-change" :title="change.title">
                {{ change.text }}
            </span>
            <svg
                v-if="spark"
                class="price-spark"
                viewBox="0 0 58 18"
                role="img"
                :aria-label="`最近 ${recent.length} 笔价格，由早到晚：${recent.map(value => moneyText(value)).join('、')}`"
            >
                <polyline :points="spark" />
            </svg>
        </div>
        <p v-if="item.note" class="price-note lg-caption" :title="item.note">
            {{ item.note }}
        </p>
        <footer class="price-card-footer">
            <span class="lg-caption" :title="current?.date">{{ summary }}</span>
            <div class="price-card-actions">
                <GlassButton
                    size="small"
                    variant="plain"
                    class="lg-inline-action price-history-trigger"
                    aria-haspopup="dialog"
                    :aria-label="`查看${item.name}的价格历史`"
                    @click="emit('history')"
                >
                    历史
                </GlassButton>
                <GlassButton
                    size="small"
                    variant="plain"
                    class="lg-inline-action price-update-trigger"
                    aria-haspopup="dialog"
                    :aria-label="`更新${item.name}的价格`"
                    :disabled="editDisabled"
                    @click="emit('record')"
                >
                    记价
                </GlassButton>
            </div>
        </footer>
    </GlassCard>
</template>

<style scoped>
.price-card {
    --lg-content-base: var(--lg-readable-card-fill);
    --liquid-ink: light-dark(#17211f, #f5f9f7);
    --liquid-muted: light-dark(#30413b, #dee9e4);
    --glass-foreground: var(--liquid-ink);
    --glass-text-shadow: none;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    padding: 8px 9px 6px;
    --lg-content-fill: color-mix(
        in srgb,
        var(--price-category-tint, var(--lg-content-base)) 9%,
        var(--lg-content-base)
    );
}

.price-card[data-category='装备灵饰'] {
    --price-category-tint: light-dark(#81a2d5, #a8c0f6);
}

.price-card[data-category='召唤兽'] {
    --price-category-tint: light-dark(#b090ca, #c7a9e8);
}

.price-card[data-category='兽决内丹'] {
    --price-category-tint: light-dark(#d39c78, #e9b590);
}

.price-card[data-category='宝石符石'] {
    --price-category-tint: light-dark(#69b5b4, #90d1d1);
}

.price-card[data-category='打造材料'] {
    --price-category-tint: light-dark(#b89c67, #d7bb86);
}

.price-card[data-category='消耗补给'] {
    --price-category-tint: light-dark(#7eb58a, #a0d3a9);
}

.price-card[data-category='任务产出'] {
    --price-category-tint: light-dark(#ce92a9, #e6a9c0);
}

.price-card[data-category='通货账号'] {
    --price-category-tint: light-dark(#c6b16b, #dfcd90);
}

.price-card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 6px;
}

.price-card-heading {
    min-width: 0;
}

.price-card-header h2 {
    margin: 0;
    overflow-wrap: anywhere;
}

.price-card-header p {
    margin-top: 2px;
    overflow-wrap: anywhere;
}

.price-quote {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 8px;
    font-variant-numeric: tabular-nums;
}

.price-value {
    font-size: var(--fs-amount);
}

.price-unpriced {
    color: var(--liquid-muted);
    font-size: var(--fs-sm);
}

.price-change {
    color: var(--trend-ink, var(--liquid-muted));
    font-size: var(--fs-mini);
}

.price-quote[data-tone='up'] {
    --trend-ink: var(--liquid-up);
}

.price-quote[data-tone='down'] {
    --trend-ink: var(--liquid-down);
}

.price-spark {
    width: 58px;
    height: 18px;
    align-self: center;
    margin-inline-start: auto;
    fill: none;
    stroke: var(--trend-ink, var(--liquid-muted));
    stroke-opacity: 0.76;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
}

.price-note {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.price-card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: auto;
    gap: 4px;
    padding-top: 4px;
    border-top: 1px solid var(--liquid-outline);
}

.price-card-actions {
    display: flex;
    align-items: center;
    gap: 4px;
}

.price-update-trigger {
    border-radius: 999px;
    background-color: light-dark(#3c706514, #c2e9db1f);
}

.price-update-trigger:not([disabled]):is(:hover, :focus-visible) {
    background-color: light-dark(#3c706528, #c2e9db38);
}
</style>
