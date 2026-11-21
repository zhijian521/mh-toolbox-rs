<script setup lang="ts">
import { ref, watch } from 'vue';

/** 图鉴缩略图与预览共用缺图状态，坏图不留浏览器破图标。 */
const props = defineProps<{ src: string; name: string; eager?: boolean }>();
const failed = ref(false);
watch(
    () => props.src,
    () => {
        failed.value = false;
    },
);
</script>

<template>
    <span class="asset-image">
        <img
            v-if="!failed"
            :src="src"
            :alt="name"
            :loading="eager ? 'eager' : 'lazy'"
            decoding="async"
            @error="failed = true"
        />
        <span v-else class="asset-image-missing" role="img" :aria-label="`${name}图片缺失`">
            图片缺失
        </span>
    </span>
</template>

<style scoped>
.asset-image {
    display: inline-grid;
    flex: none;
    place-items: center;
    width: var(--asset-image-size, calc(54px * var(--fs-scale)));
    height: var(--asset-image-size, calc(54px * var(--fs-scale)));
}
.asset-image img {
    width: 100%;
    height: 100%;
    object-fit: contain;
}
.asset-image-missing {
    color: var(--muted);
    font-size: var(--fs-mini);
}
</style>
