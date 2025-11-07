/** @type {import('tailwindcss').Config} */
module.exports = {
	content: ['./src/frontend/index.html', './src/frontend/**/*.{js,ts,html}'],
	theme: {
		extend: {
			colors: {
			},
			fontSize: {
				xxs: '0.5rem',
			},
			lineHeight: {
				xxs: '0.5rem',
			},
		},
	},
	plugins: [],
}
