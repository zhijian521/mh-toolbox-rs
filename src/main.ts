import { createApp } from 'vue';
import './styles/tokens.css';
import './styles/base.css';
import './styles/blocks.css';
import App from './App.vue';
import { router } from './router';

createApp(App).use(router).mount('#app');
