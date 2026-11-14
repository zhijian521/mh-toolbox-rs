import { onMounted, watch } from 'vue';
import { useRoute, useRouter, type LocationQuery } from 'vue-router';

/** 快捷入口只打开业务页已有界面；消费 action，避免重载或返回时重复开窗。 */
export function useRouteAction(actions: Record<string, (query: LocationQuery) => void>) {
    const route = useRoute();
    const router = useRouter();
    onMounted(() => {
        watch(
            () => route.query.action,
            (action) => {
                if (typeof action !== 'string' || !Object.hasOwn(actions, action)) return;
                const query = { ...route.query };
                void router.replace({ query: { ...query, action: undefined } });
                actions[action](query);
            },
            { immediate: true },
        );
    });
}
