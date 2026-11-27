<script setup lang="ts">
import { GlassSearch } from '../../components/liquid-glass';
import GlassDateField from '../../components/liquid-glass/GlassDateField.vue';
import GlassEmptyState from '../../components/liquid-glass/GlassEmptyState.vue';
import GlassInput from '../../components/liquid-glass/GlassInput.vue';
import GlassPriceField from '../../components/liquid-glass/GlassPriceField.vue';
import TimeField from '../../components/TimeField.vue';
import GlassNumberField from '../../components/liquid-glass/GlassNumberField.vue';
import GlassCompactNumberField from '../../components/liquid-glass/GlassCompactNumberField.vue';
import GlassSelect from '../../components/liquid-glass/GlassSelect.vue';
import type { GalleryExamples } from './gallery-examples';

const {
    priceExample,
    initialPrice,
    fieldRows,
    compactLevel,
    compactExperience,
    invalidQuantity,
    disabledQuantity,
    invalidPrice,
    unavailableCategory,
    filterOptions,
    searchExamples,
} = defineProps<{ samples: GalleryExamples }>().samples;
</script>

<template>
    <section
        v-for="row in fieldRows"
        :key="row.size"
        class="field-comparison"
        :class="{ 'lg-form-fields': row.size === '紧凑' }"
    >
        <header>
            <h3>{{ row.size }}输入控件</h3>
            <small>{{ row.size === '紧凑' ? '32' : '44' }} px</small>
        </header>
        <div class="comparison-grid">
            <div class="field-example">
                <span>搜索物品</span>
                <GlassSearch
                    v-model:value="row.query"
                    class="lg-price-search"
                    :aria-label="row.size + '搜索物品'"
                    placeholder="搜索物品"
                />
            </div>
            <label class="field-example"
                >物品名称<GlassInput v-model="row.name" placeholder="例如：金刚石"
            /></label>
            <GlassSelect v-model="row.category" :options="filterOptions" label="一级分类" />
            <GlassDateField v-model="row.date" label="记录日期" />
            <TimeField v-model="row.time" label="时刻" glass />
            <label class="field-example"
                >数量
                <GlassNumberField
                    v-model="row.quantity"
                    :label="row.size + '数量'"
                    update-on-input
                />
            </label>
        </div>
        <div v-if="row.query.trim()" class="comparison-results" role="status">
            <output v-if="searchExamples(row.query).length" class="lg-caption">{{
                searchExamples(row.query).join(' · ')
            }}</output>
            <GlassEmptyState v-else />
        </div>
    </section>
    <section>
        <header><h3>卡片内数字输入</h3></header>
        <div class="stage">
            <label class="field-example"
                >等级
                <GlassCompactNumberField v-model="compactLevel" label="示例等级" update-on-input />
            </label>
            <label class="field-example"
                >经验（点）
                <GlassCompactNumberField
                    v-model="compactExperience"
                    label="示例经验"
                    wide
                    update-on-input
                />
            </label>
        </div>
    </section>
    <section>
        <header>
            <h3>输入状态</h3>
            <small>错误 · 禁用</small>
        </header>
        <div class="stage stack lg-form-fields">
            <GlassPriceField
                v-model="invalidPrice"
                compact
                label="记录价格"
                :error="(invalidPrice ?? 0) > 0 ? '' : '价格要大于 0'"
                reserve-error
            />
            <GlassSelect
                v-model="unavailableCategory"
                class="field-example"
                label="二级分类"
                :options="[]"
                disabled
            />
            <label class="field-example"
                >数量
                <GlassNumberField
                    v-model="invalidQuantity"
                    label="示例数量"
                    update-on-input
                    :aria-invalid="invalidQuantity <= 0 || undefined"
                    :aria-describedby="invalidQuantity <= 0 ? 'sample-quantity-error' : undefined"
                />
                <span
                    v-if="invalidQuantity <= 0"
                    id="sample-quantity-error"
                    class="sample-error"
                    role="status"
                    >数量要大于 0</span
                >
            </label>
            <label class="field-example"
                >只读示例
                <GlassNumberField v-model="disabledQuantity" label="禁用数量" disabled />
            </label>
        </div>
    </section>
    <section>
        <header>
            <h3>价格输入</h3>
            <small>记价 · 初始价</small>
        </header>
        <div class="stage stack">
            <GlassPriceField v-model="priceExample" label="这一笔多少钱" />
            <GlassPriceField v-model="initialPrice" label="初始价格（选填）" compact />
        </div>
    </section>
</template>
