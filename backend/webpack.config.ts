import * as webpackNodeExternals from "webpack-node-externals";

const webpackNE = webpackNodeExternals

module.exports = {
	entry: './backend/src/main.ts', // your entry file
	output: {
		// path: path.resolve(__dirname, 'dist'), // ensure the output directory is 'dist'
		filename: 'server.js', // output filename
	},
	resolve: {
		extensions: ['.ts', '.js'], // resolve .ts and .js extensions
	},
	module: {
		rules: [
			{
				test: /\.ts$/,
				use: [
					{
						loader: 'ts-loader',
						options: {
							configFile: 'tsconfig.backend.json'
						}
					}
				],
				exclude: /node_modules/,
			},
		],
	},

	target: 'node', // make sure it's targeting Node.js
	externals: [webpackNE()],
	mode: "production",
};
