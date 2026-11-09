<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { loadPetAssets, petAssets } from '../../services/pet-assets';

const props = withDefaults(defineProps<{ name: string; kind?: 'skill' | 'portrait' }>(), {
    kind: 'skill',
});
const failed = ref(false);
const entry = computed(() =>
    props.kind === 'portrait'
        ? petAssets.value?.portraits.find((one) => one.id === props.name)
        : petAssets.value?.skills.find((one) => one.name === props.name),
);
watch(
    () => props.name,
    () => {
        failed.value = false;
    },
);
onMounted(() => {
    void loadPetAssets().catch(() => {});
});
</script>

<template>
    <span class="pet-image" :class="kind" :title="entry?.name || name || '未选择头像'">
        <img
            v-if="entry && !failed"
            :src="entry.url"
            :alt="entry.name"
            loading="lazy"
            @error="failed = true"
        />
        <span v-else aria-hidden="true">{{
            kind === 'portrait' ? '兽' : name.slice(0, 1) || '—'
        }}</span>
    </span>
</template>

<style scoped>
.pet-image {
    display: inline-grid;
    flex: none;
    place-items: center;
    width: var(--pet-icon-size, 32px);
    height: var(--pet-icon-size, 32px);
    overflow: hidden;
    border-radius: var(--r-2);
    background: var(--well);
    color: var(--muted);
    font-size: var(--fs-sm);
    vertical-align: middle;
}
.pet-image img {
    width: 100%;
    height: 100%;
    object-fit: contain;
}
.portrait {
    --pet-icon-size: 48px;
}
</style>
