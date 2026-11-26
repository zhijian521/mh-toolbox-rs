<script setup lang="ts">
import { inject } from 'vue';
import { useRouter } from 'vue-router';
import { glassLedger } from '../components/glass-ledger';
import LiquidLedgerFrame from '../components/LiquidLedgerFrame.vue';
import AppIcon from '../components/AppIcon.vue';
import LedgerSection from '../components/LedgerSection.vue';
import PageShell from '../components/PageShell.vue';
import PressTile from '../components/PressTile.vue';
import { notify } from '../composables/use-notify';
import { openExternal } from '../services/desktop';
import { TOOL_GROUPS, TOOLS, type ToolEntry } from '../tools';

const router = useRouter();
const glass = inject(glassLedger, null);

async function open(tool: ToolEntry) {
    if (tool.kind === 'link') {
        if (!(await openExternal(tool.href))) notify.error('无法打开维护公告');
        return;
    }
    void router.push(tool.path);
}

const groups = TOOL_GROUPS.map((group) => ({
    ...group,
    tools: TOOLS.filter((tool) => tool.group === group.key),
})).filter((group) => group.tools.length > 0);
</script>

<template>
    <component
        :is="glass ? LiquidLedgerFrame : PageShell"
        :class="glass ? 'liquid-tools liquid-tools-directory' : undefined"
        title="工具"
        desc="日常工具 · 游戏资料"
    >
        <div class="tool-blocks">
            <component
                :is="glass ? 'section' : LedgerSection"
                v-for="group in groups"
                :key="group.key"
                v-bind="
                    glass
                        ? { 'aria-labelledby': `tool-group-${group.key}` }
                        : { title: group.label, plain: true }
                "
            >
                <h2 v-if="glass" :id="`tool-group-${group.key}`" class="tool-group-title">
                    {{ group.label }}
                </h2>
                <ul class="tool-grid">
                    <li v-for="tool in group.tools" :key="tool.key">
                        <component
                            :is="glass?.card ?? 'div'"
                            class="tool-card"
                            :radius="glass ? 18 : undefined"
                        >
                            <button
                                class="tool-item"
                                type="button"
                                :data-group="tool.group"
                                :data-kind="tool.kind"
                                :aria-label="
                                    tool.kind === 'link' ? `${tool.name}（浏览器打开）` : tool.name
                                "
                                :title="tool.desc"
                                :aria-describedby="glass ? `tool-desc-${tool.key}` : undefined"
                                @click="open(tool)"
                            >
                                <span v-if="glass" class="tool-symbol" aria-hidden="true">
                                    <AppIcon :name="tool.icon" />
                                </span>

                                <PressTile v-else class="tool-tile">
                                    <AppIcon :name="tool.icon" />
                                </PressTile>

                                <span class="tool-name">{{ tool.name }}</span>

                                <span v-if="glass" :id="`tool-desc-${tool.key}`" hidden>{{
                                    tool.desc
                                }}</span>

                                <span v-if="glass" class="tool-direction" aria-hidden="true">
                                    <span v-if="tool.kind === 'link'">↗</span>

                                    <AppIcon v-else name="chevron-right" />
                                </span>
                            </button>
                        </component>
                    </li>
                </ul>
            </component>
        </div>
    </component>
</template>

<style scoped>
.tool-blocks {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 275px), 1fr));
    align-items: start;
    gap: 12px;
    max-width: 1000px;
}

.tool-grid {
    --cell-w: calc(74px * var(--fs-scale));
    --tile-w: 56px;
    --tool-wash: 58%;
    --tool-wash-hover: 74%;
    --tool-wash-active: 48%;

    display: grid;
    grid-template-columns: repeat(auto-fill, var(--cell-w));
    justify-content: start;
    gap: 14px 10px;
    margin: 0 0 0 calc((var(--tile-w) - var(--cell-w)) / 2);
    padding: 0;
    list-style: none;
}
.tool-grid li {
    display: flex;
}

.tool-item {
    --tint: var(--paper-2);

    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    width: var(--cell-w);
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink);
    font-family: var(--font-ui);
    cursor: pointer;
    outline: none;
}

.tool-item[data-group='daily'] {
    --tint: var(--tint-工具日程);
}
.tool-item[data-group='lookup'] {
    --tint: var(--tint-工具资料);
}
.tool-item[data-group='game'] {
    --tint: var(--tint-工具游戏);
}

.tool-tile {
    --icon-size: calc(26px * var(--fs-scale));
    --tile-face: color-mix(in srgb, var(--tint) var(--tool-wash), var(--paper));
    --tile-face-hover: color-mix(in srgb, var(--tint) var(--tool-wash-hover), var(--paper));
    --tile-face-active: color-mix(in srgb, var(--tint) var(--tool-wash-active), var(--well));
}

.tool-item:focus-visible .tool-tile {
    outline: var(--ring);
    outline-offset: var(--ring-offset);
}

.tool-name {
    width: var(--cell-w);
    font-size: var(--fs-sm);
    line-height: 1.35;
    text-align: center;
    transition: color var(--t-quick) var(--ease-soft);
}
.tool-item:hover .tool-name,
.tool-item:focus-visible .tool-name {
    color: var(--accent);
}
</style>
