import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { unified } from '@astrojs/markdown-remark';
import remarkGfm from 'remark-gfm';

export default defineConfig({
  site: 'https://rishav-banerjee.com',
  output: 'static',
  integrations: [sitemap()],

  markdown: {
    unified: unified({
      remarkPlugins: [remarkGfm],
    }),
  },

  vite: {
    plugins: [tailwindcss()],
  },
});