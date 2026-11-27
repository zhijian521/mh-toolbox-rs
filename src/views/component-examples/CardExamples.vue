<script setup lang="ts">
import LiquidPriceCard from '../prices/LiquidPriceCard.vue';
import type { GalleryExamples } from './gallery-examples';

const { sampleItem, sheetOpen, openSample } = defineProps<{ samples: GalleryExamples }>().samples;
</script>

<template>
    <section>
        <header><h3>物价卡片</h3></header>
        <div class="stage">
            <LiquidPriceCard
                class="sample-card"
                :item="sampleItem"
                @history="sheetOpen = true"
                @record="openSample('add')"
            />
        </div>
    </section>
</template>
