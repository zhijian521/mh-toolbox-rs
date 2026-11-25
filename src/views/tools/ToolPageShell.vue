<script setup lang="ts">
import { inject } from 'vue';
import { useRouter } from 'vue-router';
import { glassLedger } from '../../components/glass-ledger';
import LiquidLedgerFrame from '../../components/LiquidLedgerFrame.vue';
import PageShell from '../../components/PageShell.vue';
import PressButton from '../../components/PressButton.vue';

defineProps<{ title: string; desc: string }>();
const router = useRouter();
const glass = inject(glassLedger, null);
</script>

<template>
    <component
        :is="glass ? LiquidLedgerFrame : PageShell"
        :class="glass ? 'liquid-tools liquid-tool-detail' : undefined"
        :title="title"
        :desc="desc"
    >
        <template v-if="glass" #leading>
            <PressButton
                icon="chevron-left"
                label="返回工具列表"
                class="tool-back"
                @click="router.push('/tools')"
            />
        </template>
        <template v-if="!glass || $slots.actions" #actions>
            <PressButton
                v-if="!glass"
                icon="back"
                text="返回"
                label="返回工具列表"
                @click="router.push('/tools')"
            />
            <slot name="actions" />
        </template>
        <slot />
    </component>
</template>
