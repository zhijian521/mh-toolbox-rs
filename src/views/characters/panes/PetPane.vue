<script setup lang="ts">
import PetImage from '../PetImage.vue';
import NumTag from '../../../components/NumTag.vue';
import PressTile from '../../../components/PressTile.vue';
import type { Pet } from '../pets';
import { PET_CARD_ATTRIBUTES, PET_GROWTH_LABEL } from '../../../services/game-rules';

defineProps<{ pets: Pet[]; quick?: boolean }>();
const emit = defineEmits<{ open: [index: number] }>();

/** 卡面**固定六项、按这个顺序**摆（2026-11-11 用户：「召唤兽的展示属性 按照 气血 攻击 防御
 * 法伤 速度 成长 来展示，原本的法防不要了 价格 成长」——「价格」是「加个」的输入错，
 * 即末尾再加一项成长）。
 *
 * 是**白名单**不是黑名单：卡面只认这五项战斗属性和一项成长，其余（魔法、法防、忠诚……）
 * 一律不画。用黑名单的话，库里再多一项就得回来改一次；用白名单，卡面的版式由这张清单
 * 定死，永远是 3 + 3 两行。
 *
 * 只在这里挑着画，**数据一行不动**：编辑窗、截图识别、浮片与快速修改照旧读写全套属性。
 * 「成长」来自 pet.growth 而不是 attrs（它一位小数三位），所以由这里补一行。
 */
function cardStats(pet: Pet): { label: string; value: string }[] {
    /* 一项都没记的兽不摆六张空票（六行「—」读起来像坏了），交给空态那行说清楚。 */
    if (!pet.attrs.length && !pet.growth) return [];
    const rows = PET_CARD_ATTRIBUTES.map((label) => ({
        label,
        value: pet.attrs.find((one) => one.label === label)?.value ?? '',
    }));
    return [...rows, { label: PET_GROWTH_LABEL, value: pet.growth }];
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
                <span v-if="cardStats(pet).length" class="stats">
                    <span v-for="(row, i) in cardStats(pet)" :key="i" class="s slip-row sm"
                        ><span class="slip-name">{{ row.label }}</span
                        ><NumTag class="slip-val"
                            ><span class="lv" :class="{ blank: !row.value }">{{
                                row.value || '—'
                            }}</span></NumTag
                        ></span
                    >
                </span>
                <p v-else class="empty-note inline">尚未记录属性</p>
            </button>
        </div>
        <p v-else class="empty-note">还没有记录召唤兽</p>
    </section>
</template>

<style scoped src="./pet-pane.css"></style>
