import { defineConfig } from 'vite';
import viteCompression from 'vite-plugin-compression2';

const phasermsg = () => {
    return {
        name: 'phasermsg',
        buildStart() {
            process.stdout.write(`Building for production...\n`);
        },
        buildEnd() {
            const line = "---------------------------------------------------------";
            const msg = `❤️❤️❤️ Tell us about your game! - games@phaser.io ❤️❤️❤️`;
            process.stdout.write(`${line}\n${msg}\n${line}\n`);
            
            process.stdout.write(`✨ Done ✨\n`);
        }
    }
}

// Inject console suppression script before any modules load
const suppressConsole = () => {
    return {
        name: 'suppress-console',
        transformIndexHtml(html) {
            const script = `<script>(function(){var e=function(){};var c=console;c.log=e;c.info=e;c.warn=e;c.error=e;c.debug=e;c.trace=e;c.group=e;c.groupCollapsed=e;c.groupEnd=e;c.time=e;c.timeEnd=e;c.timeLog=e;c.table=e;c.dir=e;c.dirxml=e;c.count=e;c.countReset=e;c.assert=e;c.profile=e;c.profileEnd=e;c.clear=e;})();</script>`;
            return html.replace('<head>', '<head>' + script);
        }
    };
};   

export default defineConfig({
    base: './',
    logLevel: 'warning',
    define: {
        'import.meta.env.PROD': true,
        'import.meta.env.DEV': false
    },
    resolve: {
        dedupe: ['phaser']
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    phaser: ['phaser']
                }
            }
        },
        minify: 'terser',
        terserOptions: {
            compress: {
                passes: 2
            },
            mangle: true,
            format: {
                comments: false
            }
        }
    },
    server: {
        port: 8080,
        host: true,
        allowedHosts: ['minium.dev.fybtech.xyz', 'dev-games.dijoker.com']
    },
    plugins: [
        phasermsg(),
        suppressConsole(),
        // Precompress text assets to Brotli
        viteCompression({
            algorithm: 'brotliCompress',
            ext: '.br',
            deleteOriginalAssets: false,
            threshold: 1024,
            filter: (file) => /\.(js|css|html|svg|json|ttf|woff2?)$/i.test(file)
        }),
        // Also generate gzip as fallback
        viteCompression({
            algorithm: 'gzip',
            ext: '.gz',
            deleteOriginalAssets: false,
            threshold: 1024,
            filter: (file) => /\.(js|css|html|svg|json|ttf|woff2?)$/i.test(file)
        })
    ]
});
