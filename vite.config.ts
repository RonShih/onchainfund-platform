import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      // WSL 權限問題解決配置
      server: {
        watch: {
          usePolling: true,
          interval: 1000
        },
        host: '0.0.0.0',
        port: 3302,
        strictPort: false,
        fs: {
          allow: ['..']
        }
      },
      // 優化依賴配置 - 禁用預構建來避免權限問題
      optimizeDeps: {
        disabled: false,
        force: true,
        include: ['react', 'react-dom', 'ethers']
      },
      // 將緩存目錄設置為相對路徑
      cacheDir: 'node_modules/.vite',
      // 解決 React 相關問題
      esbuild: {
        logOverride: { 'this-is-undefined-in-esm': 'silent' }
      },
      // 避免文件權限問題
      build: {
        rollupOptions: {
          output: {
            manualChunks: undefined
          }
        }
      }
    };
});
