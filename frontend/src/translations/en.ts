
/**
 * This is the English translation file.
 */
export const en = {
	generic: {
		or: 'OR',
		username: 'Username',
		profile_picture: 'Profile Picture',
		go_back: 'Go back',
		send: 'Send',
		online: 'ONLINE',
		offline: 'OFFLINE',
		friends: 'Friends',
		add_friend: 'Add Friend',
		enter_username: 'Enter username to add',
		sending_request: 'Sending request...',
		friend_request_sent: 'Friend request sent!',
		friend_request_failed: 'Failed to send friend request',
		more_actions: 'More actions',
		view_profile: 'View profile',
		choose_game_mode: 'Choose a game mode',
		online_mode_explanation: 'Play on a server, with a matchmaking system and match history tracking.',
		offline_mode_explanation: 'Play on the same computer, without tracking the matches.',
		online_mode_login_needed: 'You need to login to play online.',
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

	settings: {
		title: 'Profile Settings',
		profile_picture_instructions: 'Recommended: Square image, max 2.5MB',
		username_instructions: 'Username must be unique and 3-24 characters long. Only letters, numbers and underscores are allowed.',
		update: {
			username: {
				title: 'Username update',
				success: 'Username updated successfully',
			},
			avatar: {
				title: 'Avatar update',
				success: 'Avatar updated successfully',
			}
		}
	}
};


export type TranslationSchema = typeof en;
