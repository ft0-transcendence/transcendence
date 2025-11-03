
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
		loading: 'Loading...',
		currently_active_games: 'Currently Active Games',
		notifications: 'Notifications',
		last_20_matches: 'Last 20 Matches',
		no_matches: 'No matches found',
		no_games: 'No games found',
		no_notifications: 'Nothing here',
		accept_friend_request: 'Accept',
		reject_friend_request: 'Reject',
		incomming_friend_requests: 'Incomming Friend Requests',
		friend_requests: 'Friend Requests',
		no_friend_requests: 'No friend requests so far',
		remove_friend: 'Remove Friend',
		remove_friend_confirm: 'Are you sure you want to remove {{username}} from your friends list? This action cannot be undone.',
		confirm: 'Confirm',
		cancel: 'Cancel',
		remove_friend_success: 'Friend removed successfully',
		hide: 'Hide',
		show: 'Show',
		sent_friend_requests: 'Sent requests',
		cancel_friend_request: 'Cancel Friend Request',
		cancel_friend_request_confirm: 'Are you sure you want to cancel this friend request from your friends list? This action cannot be undone.',
		wins: 'Wins',
		losses: 'Losses',
		tournaments_won: 'Tournaments Won',
		played_games: 'Played Games',
		win_rate: 'Win Rate',
	},
	game: {
		player_disconnected: 'Player <b>{{playerName}}</b> disconnected',
		time_left_before_forfeit: 'Forfeit in {{timeLeftMs}} seconds',
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
		landing_page: 'Landing Page',
	},
	play: {
		enter_your_username: 'Enter Your Username',
		start_game: 'Start Game',
		enter_players_usernames: 'Enter Players Usernames',
		left_player_input_label: 'Left Player (W, S keys)',
		right_player_input_label: 'Right Player (↑, ↓ keys)',
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
	},


	page_titles: {
		play: {
			online: {
				"1v1_game": '1 VS 1 - online game',
				"1v1_matchmaking": '1 VS 1 Matchmaking - online',
				"tournaments": 'Tournaments - online',
			},
			offline: {
				"1vAI": '1 VS AI - offline',
				"1v1": '1 VS 1 - offline',
				"tournaments": 'Tournaments - offline',
			}
		}
	},
};


export type TranslationSchema = typeof en;
