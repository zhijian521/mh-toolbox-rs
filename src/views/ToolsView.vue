<script setup lang="ts">
import { useRouter } from 'vue-router';
import AppIcon from '../components/AppIcon.vue';
import LedgerSection from '../components/LedgerSection.vue';
import PageShell from '../components/PageShell.vue';
import PressTile from '../components/PressTile.vue';
import { notify } from '../composables/use-notify';
import { openExternal } from '../services/desktop';
import { TOOL_GROUPS, TOOLS, type ToolEntry } from '../tools';

const router = useRouter();

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
    <PageShell title="工具" desc="日常工具 · 游戏资料">
        <div class="tool-blocks">
            <LedgerSection v-for="group in groups" :key="group.key" :title="group.label" plain>
                <ul class="tool-grid">
                    <li v-for="tool in group.tools" :key="tool.key">
                        <button
                            class="tool-item"
                            type="button"
                            :data-group="tool.group"
                            :data-kind="tool.kind"
                            :aria-label="
                                tool.kind === 'link' ? `${tool.name}（浏览器打开）` : tool.name
                            "
                            :title="tool.desc"
                            @click="open(tool)"
                        >
                            <PressTile class="tool-tile">
                                <AppIcon :name="tool.icon" />
                            </PressTile>
                            <span class="tool-name">{{ tool.name }}</span>
                        </button>
                    </li>
                </ul>
            </LedgerSection>
        </div>
    </PageShell>
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
