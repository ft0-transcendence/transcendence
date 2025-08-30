
/**
 * This is the English translation file.
 */
export const en = {
	generic: {
		or: 'OR',
		choose_game_mode: 'Choose a game mode',
		online: 'ONLINE',
		offline: 'OFFLINE',
		online_mode_explanation: 'Play on a server, with a matchmaking system and match history tracking.',
		offline_mode_explanation: 'Play on the same computer, without tracking the matches.',
		online_mode_login_needed: 'You need to login to play online.',
		go_back: 'Go back',
	},
	game_modes: {
		ai: '1 vs AI',
		vs: '1 vs 1',
		tournament: 'Tournament',
	},
	landing_page: {
		description: 'Welcome to the classic Pong experience! Challenge your friends or improve your skills in this timeless game of digital table tennis. Simple to learn, hard to master.',
	},
	navbar: {
		menu: 'Menu',
		start_here: 'Start Here',
		login: 'Login',
		logout: 'Logout',
		settings: 'Settings',
		profile: 'Profile',
		language: 'Language',
		language_select: 'Select Language',
		homepage: 'Homepage',
		online_game: 'Play Online',
		tournaments: 'Tournaments',
		start_playing: 'Start Playing',
		fullscreen_mode: 'Fullscreen mode',
	},
}

export type TranslationSchema = typeof en;
