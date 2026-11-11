<script setup lang="ts">
import PetImage from '../PetImage.vue';
import NumTag from '../../../components/NumTag.vue';
import PressTile from '../../../components/PressTile.vue';
import type { Pet } from '../pets';

defineProps<{ pets: Pet[]; quick?: boolean }>();
const emit = defineEmits<{ open: [index: number] }>();

/** 卡上不写魔法（2026-11-11 用户：「下面的属性去掉魔法，从三行变成两行」）。
 *
 * 只在这一处过滤，**不动数据**：编辑窗与截图识别照旧有这一项，浮片与快速修改也照旧
 * 能改它——卡面是「一眼看战力」的地方，七个数字排到第三行只剩一个孤零零的法防，
 * 去掉魔法正好 3 + 3 两行。
 */
const HIDDEN_ATTR = '魔法';
function cardAttrs(pet: Pet) {
    return pet.attrs.filter((row) => row.label !== HIDDEN_ATTR);
}
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
                <!-- 头像块 + 右边一列两张属性票（2026-11-11 用户第四轮：
                     「都不行都不用，把名字 和 技能的样式 同步为 下面属性一样的 即可」）。
                     名字（含等级）与技能**不再自己造任何材质**：各是一张 `.slip-row.sm`，
                     与下面六项属性同一套面（--well 34%）、四道棱、落影、28 高、--tag-w 52。
                     头像仍是一枚凸起的纸块（PressTile still，块 64 / 图 56），
                     右边一列居中排两张票，整块与头像齐平。 -->
                <span class="beast-head">
                    <PressTile still class="beast-plate">
                        <PetImage :name="pet.portrait || ''" kind="portrait" />
                    </PressTile>
                    <span class="beast-id">
                        <span class="slip-row sm name-row">
                            <span class="slip-name beast-name">{{ pet.name || '未命名' }}</span>
                            <NumTag class="slip-val"
                                ><span class="lv">{{ pet.level }}<i>级</i></span></NumTag
                            >
                        </span>
                        <span class="slip-row sm skill-line" aria-label="已学技能">
                            <span class="skill-icons"
                                ><PetImage
                                    v-for="(name, i) in pet.skills"
                                    :key="i"
                                    :name="name"
                                /><span v-if="!pet.skills.length" class="empty-note inline"
                                    >尚未记录技能</span
                                ></span
                            >
                        </span>
                    </span>
                </span>
                <span class="stats">
                    <span v-for="(row, i) in cardAttrs(pet)" :key="i" class="s slip-row sm"
                        ><span class="slip-name">{{ row.label }}</span
                        ><NumTag class="slip-val"
                            ><span class="lv" :class="{ blank: !row.value }">{{
                                row.value || '—'
                            }}</span></NumTag
                        ></span
                    >
                    <span v-if="!cardAttrs(pet).length" class="empty-note inline"
                        >尚未记录属性</span
                    >
                </span>
            </button>
        </div>
        <p v-else class="empty-note">还没有记录召唤兽</p>
    </section>
</template>

<style scoped src="./pet-pane.css"></style>
