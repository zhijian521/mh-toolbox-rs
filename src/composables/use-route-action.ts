import type { ActionPath, RouteAction } from '../route-actions';
import { onMounted, watch } from 'vue';
import { useRoute, useRouter, type LocationQuery } from 'vue-router';

/** 快捷入口只打开业务页已有界面；消费 action，避免重载或返回时重复开窗。 */
export function useRouteAction<P extends ActionPath>(
    path: P,
    actions: Record<RouteAction<P>, (query: LocationQuery) => void>,
) {
    const route = useRoute();
    const router = useRouter();
    onMounted(() => {
        watch(
            () => [route.path, route.query.action] as const,
            ([currentPath, action]) => {
                if (currentPath !== path) return;
                if (typeof action !== 'string' || !Object.hasOwn(actions, action)) return;
                const query = { ...route.query };
                void router.replace({ query: { ...query, action: undefined } });
                actions[action as RouteAction<P>](query);
            },
            { immediate: true },
        );
    });
}
