import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', '.output/**', '.nitro/**', '.netlify/**', '.tanstack/**', 'src/routeTree.gen.ts', 'worker-configuration.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
)
