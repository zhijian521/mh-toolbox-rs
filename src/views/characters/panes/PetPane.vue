<script setup lang="ts">
import { computed } from 'vue';
import { joinShort, lifeLow, previewSkills, previewStats, type Pet } from '../pets';

/** 卡内「召唤兽」页。拆法与理由见 `AttrPane.vue` 顶部。 */
const props = defineProps<{ pets: Pet[]; charLevel: number }>();

/* 详情档案（`PetDetail`）`Teleport` 到 body，与装备浮片一样挂在卡片上——
 * 这一页只负责列牌与抛「要看哪一只」。
 *
 * 抛的是**下标**不是对象：详情页的「修改」要交给快速修改，而 `QuickTarget` 里
 * 召唤兽的定位键也是下标（`Pet` 没有 id，名字可能重）。两处用同一个键，
 * 卡片就不必再 `indexOf` 反查一次——那种反查在数组被替换之后会失效。 */
const emit = defineEmits<{ open: [index: number] }>();

/* ---------- 概览牌的取数 ----------
 * 五格属性、前四个技能名、参战差额、寿命告警**一次算完**，模板只负责画。
 * 放在 computed 里而不是模板里调函数：模板里 `v-for` 里再调三次 `previewSkills`
 * 会每帧新建三个数组，而这个列表重渲染的频率（切页签、悬停）比想象的高。
 */
const views = computed(() =>
    props.pets.map((pet) => ({
        pet,
        short: joinShort(pet, props.charLevel),
        stats: previewStats(pet),
        skills: previewSkills(pet),
        lowLife: lifeLow(pet.life),
    })),
);
</script>

<template>
    <section class="pane" role="tabpanel">
        <div v-if="views.length" class="pet-list">
            <button
                v-for="(view, index) in views"
                :key="view.pet.name"
                type="button"
                class="plate"
                :aria-label="`查看 ${view.pet.name || '这只召唤兽'} 的详情`"
                @click="emit('open', index)"
            >
                <span class="beast-head">
                    <span class="elem">{{ view.pet.element || '—' }}</span>
                    <span class="beast-name">{{ view.pet.name || '未命名' }}</span>
                    <!-- 0 级退灰（`idle`）：与票行的 `.idle` 同一条，
                         「还没开始」不该和「练到 136」一样亮。 -->
                    <span class="lv num" :class="{ idle: !view.pet.level }"
                        >{{ view.pet.level }} 级</span
                    >
                    <!-- 参战签：带得动是普通签，带不动转朱并报差额。
                         旧版只摆「参战 65」，从不跟人物等级比。 -->
                    <span class="chip join" :class="{ short: view.short > 0 }">
                        参战 {{ view.pet.joinLevel
                        }}<b v-if="view.short > 0">差 {{ view.short }}</b>
                    </span>
                </span>

                <!-- 五格固定顺序，缺项画淡「—」而**不省略那一格**：
                     省一格会让后面四项各往前挪一位，「速度」那一栏里其实是法伤。 -->
                <span class="stats">
                    <span v-for="row in view.stats" :key="row.label" class="s">
                        <span class="k">{{ row.label }}</span>
                        <span class="v" :class="{ blank: !row.value }">{{ row.value || '—' }}</span>
                    </span>
                </span>

                <span class="skill-line" :class="{ none: !view.pet.skills.length }">
                    <span class="k">技能</span>
                    <span class="names">{{
                        view.pet.skills.length ? view.skills.names.join(' · ') : '无'
                    }}</span>
                    <span v-if="view.skills.rest" class="more num">{{ view.skills.rest }}</span>
                </span>
            </button>
        </div>
        <!-- 一只都没有时给一句话，与师门、辅助两页同一句式：
             空白的纸页读作「没画完」，一句话才说明「这里本来就还没记」。 -->
        <p v-else class="empty-note">还没有记录召唤兽</p>
    </section>
</template>

<style scoped src="./pet-pane.css"></style>
