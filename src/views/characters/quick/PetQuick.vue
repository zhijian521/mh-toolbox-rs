<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import ModalShell from '../../../components/ModalShell.vue';
import PressButton from '../../../components/PressButton.vue';
import PetDetailForm from '../editor/PetDetailForm.vue';
import { applyPet } from './quick-target';
import type { CharacterData, Pet } from '../character';

/**
 * 一只召唤兽的整份表单（快速修改的宽窗）。
 *
 * 与 `GearQuick` 同一条来由：第一版只问名字 / 等级 / 参战等级 / 成长 / 寿命 / 五行六格，
 * 资质、技能、内丹这些「这只兽到底值不值」的东西全在「编辑」那份表单里——而用户
 * 点开一只兽，十次有八次就是想看/改那几项。
 *
 * ---- 名字必填 ----
 * `normalizePet` 会丢掉没有名字的兽，所以保存按钮在名字空着时是禁用的（`applyPet`
 * 里还有第二道）。这不是校验癖：允许存空等于「点一下保存，它就不见了」。
 */
const props = defineProps<{ character: CharacterData; index: number }>();
const emit = defineEmits<{ save: [character: CharacterData]; close: [] }>();

const source = computed(() => props.character.pets[props.index] ?? null);

/* 深拷贝的理由见 `GearQuick`：Esc 该是「什么都没发生」。 */
const pet = ref<Pet | null>(
    source.value ? (JSON.parse(JSON.stringify(source.value)) as Pet) : null,
);

const canSave = computed(() => (pet.value?.name ?? '').trim() !== '');

function save() {
    if (!pet.value || !canSave.value) return;
    emit('save', applyPet(props.character, props.index, pet.value));
}

const form = ref<HTMLElement | null>(null);

onMounted(async () => {
    await nextTick();
    form.value?.querySelector<HTMLInputElement>('input')?.focus();
});
</script>

<template>
    <ModalShell
        class="character-theme"
        :data-school="character.school || ''"
        :title="`快速修改 · 召唤兽 ${pet?.name.trim() || '未命名'}`"
        :width="620"
        initial-focus="none"
        @close="emit('close')"
    >
        <div v-if="pet" ref="form" class="pet-quick">
            <PetDetailForm v-model="pet" />
        </div>
        <p v-else class="note">这只召唤兽已经不在了。</p>

        <template #footer>
            <PressButton
                data-modal-cancel
                text="取消"
                label="放弃这次修改"
                @click="emit('close')"
            />
            <PressButton
                icon="check"
                text="保存"
                label="保存这只召唤兽"
                seal
                :disabled="!canSave"
                @click="save"
            />
        </template>
    </ModalShell>
</template>

<style scoped>
.pet-quick {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
}
.note {
    margin: 2px 0 0;
    color: var(--muted);
    font-size: var(--fs-mini);
    text-align: center;
}
</style>
