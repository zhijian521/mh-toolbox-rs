<script setup lang="ts">
import PetImage from '../PetImage.vue';
import NumTag from '../../../components/NumTag.vue';
import type { Pet } from '../pets';

defineProps<{ pets: Pet[]; quick?: boolean }>();
const emit = defineEmits<{ open: [index: number] }>();
</script>

<template>
    <section class="pane" role="tabpanel">
        <div v-if="pets.length" class="pet-list">
            <button
                v-for="(pet, index) in pets"
                :key="index"
                type="button"
                class="plate"
                :aria-label="`查看 ${pet.name || '这只召唤兽'} 的详情`"
                :disabled="!quick"
                @click="emit('open', index)"
            >
                <span class="beast-head"
                    ><PetImage :name="pet.portrait || ''" kind="portrait" /><span
                        class="beast-name"
                        >{{ pet.name || '未命名' }}</span
                    ><span class="lv num">{{ pet.level }} 级</span></span
                >
                <span class="stats">
                    <span v-for="(row, i) in pet.attrs" :key="i" class="s slip-row sm"
                        ><span class="slip-name">{{ row.label }}</span
                        ><NumTag class="slip-val"
                            ><span class="lv" :class="{ blank: !row.value }">{{
                                row.value || '—'
                            }}</span></NumTag
                        ></span
                    >
                    <span v-if="!pet.attrs.length" class="empty-note">尚未记录属性</span>
                </span>
                <span class="skill-line" aria-label="已学技能"
                    ><PetImage v-for="(name, i) in pet.skills" :key="i" :name="name" /><span
                        v-if="!pet.skills.length"
                        class="empty-note"
                        >尚未记录技能</span
                    ></span
                >
            </button>
        </div>
        <p v-else class="empty-note">还没有记录召唤兽</p>
    </section>
</template>

<style scoped src="./pet-pane.css"></style>
