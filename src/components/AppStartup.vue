<script setup lang="ts">
import PressButton from './PressButton.vue';

withDefaults(defineProps<{ stage?: number; error?: string }>(), {
    stage: 0,
    error: '',
});
defineEmits<{ reload: [] }>();

const phases = ['载入', '数据', '页面'];
const statuses = ['正在启动应用', '正在读取账簿', '正在打开页面'];
</script>

<template>
    <section class="app-startup" :class="{ failed: error }" aria-label="应用启动">
        <div class="startup-layout">
            <div class="startup-book" aria-hidden="true">
                <span class="book-label">梦幻手记</span>
                <div class="book-stitches"><i /><i /><i /><i /></div>
                <span class="book-stamp">日有所记</span>
            </div>
            <div class="startup-copy">
                <h1>梦幻养老助手</h1>
                <p class="startup-subtitle">把每一份成长，慢慢记下。</p>
                <p class="startup-status" :role="error ? 'alert' : 'status'">
                    <i v-if="!error" class="status-dot" aria-hidden="true" />
                    {{ error || statuses[stage] }}
                </p>
                <template v-if="!error">
                    <div class="startup-track" aria-hidden="true">
                        <i
                            v-for="segment in 18"
                            :key="segment"
                            :class="{
                                filled: segment <= stage * 6,
                                pending: segment > stage * 6 && segment <= (stage + 1) * 6,
                            }"
                        />
                    </div>
                    <div class="startup-phases" aria-hidden="true">
                        <span
                            v-for="(phase, index) in phases"
                            :key="phase"
                            :class="{ active: index === stage, done: index < stage }"
                        >
                            {{ phase }}
                        </span>
                    </div>
                </template>
                <PressButton
                    v-else
                    class="startup-reload"
                    text="重新加载"
                    label="重新加载应用"
                    seal
                    @click="$emit('reload')"
                />
            </div>
        </div>
    </section>
</template>

<style scoped>
.app-startup {
    display: grid;
    flex: 1;
    place-items: center;
    min-height: 0;
    padding: 36px 28px 76px;
    overflow: auto;
}
.startup-layout {
    display: flex;
    align-items: center;
    gap: 52px;
}
.startup-book {
    position: relative;
    flex: none;
    width: 150px;
    height: 186px;
    border: 1px solid var(--accent-ink);
    border-radius: 3px 7px 7px 3px;
    background: var(--paper);
    box-shadow:
        4px 3px 0 var(--paper-2),
        5px 4px 0 var(--rule-2),
        8px 7px 0 var(--paper),
        9px 8px 0 var(--rule),
        10px 19px 24px -15px var(--shadow-lg);
    transform: rotate(-7deg);
}
.startup-book::before {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 17px;
    border-left: 1px solid var(--rule-2);
    content: '';
}
.book-label {
    position: absolute;
    top: 20px;
    right: 22px;
    padding: 12px 9px;
    border: 1px solid var(--accent);
    background: var(--paper-2);
    color: var(--accent-ink);
    font-size: var(--fs-xl);
    line-height: 1.4;
    letter-spacing: 0.15em;
    writing-mode: vertical-rl;
}
.book-stitches {
    position: absolute;
    top: 20px;
    bottom: 20px;
    left: 9px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
}
.book-stitches i {
    width: 16px;
    height: 5px;
    border-top: 1px solid var(--accent);
    border-bottom: 1px solid var(--accent);
    transform: rotate(-15deg);
}
.book-stamp {
    position: absolute;
    bottom: 18px;
    left: 37px;
    color: var(--muted);
    font-size: var(--fs-xs);
    letter-spacing: 0.15em;
}
.startup-copy {
    width: 280px;
}
.startup-copy h1 {
    margin: 0 0 9px;
    color: var(--ink);
    font-size: calc(var(--fs-xl) * 1.27);
    font-weight: 400;
    letter-spacing: 0.08em;
    line-height: 1.4;
}
.startup-subtitle {
    margin: 0;
    color: var(--muted);
    font-size: var(--fs-xs);
    letter-spacing: 0.12em;
}
.startup-status {
    display: flex;
    align-items: center;
    gap: 9px;
    min-height: 22px;
    margin: 29px 0 12px;
    color: var(--ink-2);
    font-size: var(--fs-sm);
}
.status-dot {
    flex: none;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--accent);
    animation: startup-pulse 1.6s ease-in-out infinite;
}
.startup-track {
    display: flex;
    gap: 4px;
    height: 14px;
    padding: 3px;
    border-radius: 3px;
    background: var(--well);
    box-shadow: inset 0 1px 2px var(--bevel-lo);
}
.startup-track i {
    flex: 1;
    border-radius: 1px;
    background: var(--rule);
}
.startup-track .filled,
.startup-track .pending {
    background: var(--accent);
    box-shadow:
        inset 0 1px 0 var(--bevel-hi),
        inset 0 -2px 0 var(--bevel-lo);
}
.startup-track .pending {
    animation: startup-pulse 1.6s ease-in-out infinite;
}
.startup-phases {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    margin-top: 12px;
    color: var(--muted);
    font-size: var(--fs-mini);
}
.startup-phases .active {
    color: var(--accent);
}
.startup-phases .done {
    color: var(--ink-2);
}
.failed .startup-status {
    color: var(--danger);
}
.startup-reload {
    margin-top: 2px;
}
@keyframes startup-pulse {
    0%,
    100% {
        opacity: 0.35;
    }
    50% {
        opacity: 1;
    }
}
@media (max-width: 580px) {
    .startup-layout {
        flex-direction: column;
        gap: 34px;
    }
    .startup-copy {
        width: min(280px, calc(100vw - 56px));
        text-align: center;
    }
    .startup-status {
        justify-content: center;
    }
}
@media (prefers-reduced-motion: reduce) {
    .status-dot,
    .startup-track .pending {
        animation: none;
    }
}
</style>
