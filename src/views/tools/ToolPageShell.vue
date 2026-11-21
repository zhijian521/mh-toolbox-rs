<script setup lang="ts">
import { useRouter } from 'vue-router';
import PageShell from '../../components/PageShell.vue';
import PressButton from '../../components/PressButton.vue';

defineProps<{ title: string; desc: string }>();
const router = useRouter();
</script>

<template>
    <PageShell :title="title" :desc="desc">
        <template #actions>
            <PressButton
                icon="back"
                text="返回"
                label="返回工具列表"
                @click="router.push('/tools')"
            />
            <slot name="actions" />
        </template>
        <slot />
    </PageShell>
</template>
