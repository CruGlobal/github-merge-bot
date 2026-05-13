import * as esbuild from 'esbuild'

await esbuild.build({
    entryPoints: ['./src/index.ts'],
    bundle: true,
    platform: 'node',
    target: 'node24',
    outfile: 'dist/handler.js',
    sourcemap: true,
    format: 'cjs',
})

console.log('Built handler.js')
