<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import PressButton from '../../../components/PressButton.vue';
import { loadPetAssets, petAssets } from '../../../services/pet-assets';
import PetImage from '../PetImage.vue';

const selected = defineModel<string>({ default: '' });
const query = ref('');
const limit = ref(48);
const error = ref('');
const filtered = computed(() =>
    (petAssets.value?.portraits ?? []).filter((one) => one.name.includes(query.value.trim())),
);
async function load() {
    error.value = '';
    try {
        await loadPetAssets();
    } catch {
        error.value = '头像资源未加载，请重试';
    }
}
onMounted(load);
</script>

<template>
    <details class="portrait-picker">
        <summary><PetImage :name="selected" kind="portrait" /><span>选择召唤兽头像</span></summary>
        <div class="portrait-tools">
            <input
                v-model="query"
                class="field"
                type="search"
                placeholder="搜索召唤兽"
                aria-label="搜索召唤兽头像"
                @input="limit = 48"
            />
            <PressButton
                v-if="selected"
                text="清除"
                label="清除召唤兽头像"
                size="sm"
                @click="selected = ''"
            />
        </div>
        <p v-if="error" role="alert">
            {{ error }}
            <PressButton text="重试" label="重试加载召唤兽资源" size="sm" @click="load" />
        </p>
        <div class="portrait-grid">
            <button
                v-for="one in filtered.slice(0, limit)"
                :key="one.id"
                type="button"
                :aria-pressed="selected === one.id"
                :aria-label="`选择头像：${one.name}`"
                @click="selected = one.id"
            >
                <PetImage :name="one.id" kind="portrait" /><span>{{ one.name }}</span>
            </button>
        </div>
        <p v-if="!filtered.length && !error">未找到头像</p>
        <PressButton
            v-if="filtered.length > limit"
            text="显示更多"
            label="显示更多召唤兽头像"
            size="sm"
            @click="limit += 48"
        />
    </details>
</template>

<style scoped>
.portrait-picker {
    min-width: 0;
}
summary {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    color: var(--ink-2);
    font-size: var(--fs-sm);
}
.portrait-tools {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 10px 0;
}
.portrait-tools input {
    min-width: 0;
    width: 100%;
}
.portrait-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 7px;
    max-height: 300px;
    overflow-y: auto;
}
.portrait-grid button {
    display: grid;
    justify-items: center;
    gap: 5px;
    padding: 5px 2px;
    border: 1px solid transparent;
    border-radius: var(--r-2);
    background: transparent;
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-mini);
    cursor: pointer;
}
.portrait-grid button[aria-pressed='true'] {
    border-color: var(--ochre);
    background: var(--well);
}
.portrait-grid button:focus-visible,
summary:focus-visible {
    outline: var(--ring);
    outline-offset: var(--ring-offset);
}
p {
    color: var(--muted);
    font-size: var(--fs-mini);
}
</style>
