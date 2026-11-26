<script setup lang="ts">
import LedgerSection from '../../components/LedgerSection.vue';
import { useAppInfo } from '../../composables/use-app-info';
import { useFontFamily } from '../../composables/use-font-family';
import UpdateCheck from './UpdateCheck.vue';

/** 版本共用应用信息单例；数据位置直接可见，低频环境信息折叠。 */
const { info, version } = useAppInfo();
const { font, selectedFont } = useFontFamily();
</script>

<template>
    <LedgerSection title="关于" hint="版本与应用信息" plain>
        <dl class="about">
            <dt>产品名</dt>
            <dd>{{ info?.productName ?? '梦幻养老助手' }}</dd>
            <dt>版本</dt>
            <dd>
                {{ version }}
            </dd>
            <dt>数据目录</dt>
            <dd>
                <code>{{ info?.dataDir ?? '%APPDATA%\\mh-tool-rs' }}</code>
            </dd>
            <dt>字体</dt>
            <dd>
                {{ selectedFont.label }}
                <template v-if="font === 'system'">（由操作系统提供）</template>
                <template v-else>（SIL OFL 1.1，常用字子集）</template>
            </dd>
        </dl>
        <UpdateCheck />
        <details class="runtime-details">
            <summary>运行信息</summary>
            <dl class="about">
                <dt>标识</dt>
                <dd>
                    <code>{{ info?.identifier ?? 'com.zhijian.mhtoolbox.rs' }}</code>
                </dd>
                <dt>数据库</dt>
                <dd><code>mh-toolbox.db</code>（SQLite · WAL）</dd>
                <dt>运行环境</dt>
                <dd>{{ info?.webview ?? '系统 WebView2（Tauri 2）' }}</dd>
            </dl>
        </details>
    </LedgerSection>
</template>

<style scoped>
.about {
    display: grid;
    grid-template-columns: 5em minmax(0, 1fr);
    gap: 6px 12px;
    align-items: baseline;
}
.about dt {
    color: var(--muted);
    font-family: var(--font-ui);
    font-size: var(--fs-xs);
    letter-spacing: 0.08em;
}
.about dd {
    color: var(--ink-2);
    font-size: var(--fs-sm);
    overflow-wrap: anywhere;
}
.about code {
    font-family: var(--font-ui);
    font-size: var(--fs-xs);
    letter-spacing: 0;
}
.runtime-details {
    margin-top: 14px;
    color: var(--muted);
    font-size: var(--fs-xs);
}
.runtime-details summary {
    cursor: pointer;
    width: fit-content;
}
.runtime-details .about {
    margin-top: 10px;
}
</style>
