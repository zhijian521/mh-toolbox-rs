<script setup lang="ts">
import { computed } from 'vue';
import AppIcon from '../../components/AppIcon.vue';
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
            <div class="price-card-actions">
                <GlassButton
                    size="small"
                    shape="circle"
                    variant="plain"
                    class="lg-inline-action price-history-trigger"
                    aria-haspopup="dialog"
                    :aria-label="`查看${item.name}的价格历史`"
                    title="价格历史"
                    @click="emit('history')"
                >
                    <AppIcon name="history" />
                </GlassButton>
                <slot name="actions" />
            </div>
        </header>
        <div class="price-quote" :data-tone="change?.tone">
            <div class="price-reading">
                <span v-if="current" class="price-value">{{ moneyText(current.price) }}</span>
                <span v-else class="price-unpriced">未记价</span>
                <span v-if="change" class="price-change" :title="change.title">
                    {{ change.text }}
                </span>
            </div>
            <svg
                v-if="spark"
                class="price-spark"
                viewBox="0 0 58 18"
                role="img"
                :aria-label="`最近 ${recent.length} 笔价格，由早到晚：${recent.map((value) => moneyText(value)).join('、')}`"
            >
                <polyline :points="spark" />
            </svg>
        </div>
        <p v-if="item.note" class="price-note lg-caption" :title="item.note">
            {{ item.note }}
        </p>
        <footer class="price-card-footer">
            <span class="lg-caption" :title="current?.date">{{ summary }}</span>
            <GlassButton
                size="small"
                class="lg-inline-action price-update-trigger"
                aria-haspopup="dialog"
                :aria-label="`更新${item.name}的价格`"
                :disabled="editDisabled"
                @click="emit('record')"
            >
                <AppIcon name="edit" />记价
            </GlassButton>
        </footer>
    </GlassCard>
</template>

<style scoped>
.price-card {
    --glass-foreground: var(--liquid-ink);
    --glass-text-shadow: none;
    --icon-size: 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    padding: 9px 10px 8px;
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
    font-size: var(--fs-md);
    font-weight: 400;
    line-height: 1.4;
    overflow-wrap: anywhere;
}

.price-card-header p {
    margin: 1px 0 0;
    overflow-wrap: anywhere;
}

.price-quote {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: var(--r-2);
    background: var(--lg-bar-fill);
    font-variant-numeric: tabular-nums;
}

.price-reading {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 6px;
    min-width: 0;
}

.price-value {
    min-width: 0;
    font-size: var(--fs-amount);
    line-height: 1.3;
    overflow-wrap: anywhere;
}

.price-unpriced {
    color: var(--liquid-muted);
    font-size: var(--fs-sm);
}

.price-change {
    color: var(--trend-ink, var(--liquid-muted));
    font-size: var(--fs-xs);
    white-space: nowrap;
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
    flex: none;
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
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.price-card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: auto;
    flex-wrap: wrap;
    gap: 6px 10px;
}

.price-card-actions {
    display: flex;
    flex: none;
    align-items: center;
    gap: 4px;
}

.price-update-trigger {
    flex: none;
    margin-inline-start: auto;
}
</style>
