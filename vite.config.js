import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // 這行是關鍵：強制讓瀏覽器認識 global
    global: 'window',
  },
  resolve: {
    alias: {
      // 預防路徑解析問題
      path: 'path-browserify',
    },
  },
})