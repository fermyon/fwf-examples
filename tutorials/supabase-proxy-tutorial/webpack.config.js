import path from 'path';
import SpinSdkPlugin from "@spinframework/build-tools/plugins/webpack/index.js";
import webpack from 'webpack';

const config = async () => {
    let SpinPlugin = await SpinSdkPlugin.init()
    return {
        mode: 'production',
        stats: 'errors-only',
        entry: './src/index.ts',
        experiments: {
            outputModule: true,
        },
        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    use: 'ts-loader',
                    exclude: /node_modules/,
                },
            ],
        },
        resolve: {
            extensions: ['.tsx', '.ts', '.js'],
            alias: {
                globalThis: false
            }
        },
        output: {
            path: path.resolve(process.cwd(), './build'),
            filename: 'bundle.js',
            module: true,
            library: {
                type: "module",
            }
        },
        plugins: [
            SpinPlugin,
            new webpack.ProvidePlugin({
                global: 'globalThis',
                window: 'globalThis',
            }),
        ],
        optimization: {
            minimize: false
        },
        performance: {
            hints: false,
        }
    };
}
export default config