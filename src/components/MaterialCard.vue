<script setup lang="ts">
withDefaults(
    defineProps<{
        as?: 'article' | 'section' | 'div';
        material?: 'glass' | 'frosted' | 'turned-metal';
    }>(),
    { as: 'div', material: 'glass' },
);
</script>

<template>
    <component :is="as" class="material-card" :data-material="material">
        <slot />
    </component>
</template>
