import path from 'path';
import webpackNodeExternals from "webpack-node-externals";

module.exports = {
    entry: './src/server.ts', // your entry file
    output: {
        path: path.resolve(__dirname, 'dist'), // ensure the output directory is 'dist'
        filename: 'server.js', // output filename
    },
    resolve: {
        extensions: ['.ts', '.js'], // resolve .ts and .js extensions
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },

    target: 'node', // make sure it's targeting Node.js
    externals: [webpackNodeExternals()],
    mode: "production",
};
