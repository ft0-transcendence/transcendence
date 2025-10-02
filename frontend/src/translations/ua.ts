import { TranslationSchema } from "./en";

/**
 * This is the Ukrainian translation file.
 */
export const ua: TranslationSchema = {
	generic: {
		or: 'Або',
		choose_game_mode: 'Виберіть режим гри',
		friends: 'Друзі',
		online: 'ОНЛАЙН',
		offline: 'ОФФЛАЙН',
		online_mode_explanation: 'Грати онлайн, з системою матчемплей та відстеженням ігор.',
		offline_mode_explanation: 'Грати на одному комп’ютері, без відстеження ігор.',
		online_mode_login_needed: 'Вам потрібно увійти, щоб грати онлайн.',
		go_back: 'Повернутись назад',
		username: 'Ім’я користувача',
		profile_picture: 'Образ профілю',
		add_friend: 'Додати друга',
		enter_username: 'ім’я друга',
		friend_request_failed: 'Не вдалося надіслати запит на дружбу',
		friend_request_sent: 'Запит на дружбу надіслано!',
		more_actions: 'Ще деякі дії',
		view_profile: 'Переглянути профіль',
		send: 'Надіслати',
		sending_request: 'Надсилання запиту...',
		currently_active_games: 'Поточні активні гри',
		notifications: 'Сповіщення',
		last_20_matches: 'Останні 20 матчів',
		loading: 'Завантаження...',
		no_matches: 'Не знайдено матчів',
		no_games: 'Секція пуста',
		no_notifications: 'Немає сповіщень',
		accept_friend_request: 'Прийняти',
		reject_friend_request: 'Відхилити',
		friend_requests: 'Запити на дружбу',
		no_friend_requests: 'Немає запитів на дружбу',
		remove_friend: 'Видалити друга',
		remove_friend_confirm: 'Ви впевнені, що хочете видалити {{username}} зі своєї списку друзів? Цю дію неможливо скасувати.',
		confirm: 'Підтвердити',
		cancel: 'Скасувати',
		remove_friend_success: 'Друг успішно видалений',
	},
	game_modes: {
		ai: '1 vs AI',
		vs: '1 vs 1',
		tournament: 'Турнір',
	},
	landing_page: {
		description: 'Ласкаво просимо до класичної екранної гри Pong! Змагайтеся з друзями або покращуйте свої навички в цій незабутній грі. Гра проста, але складна.',
	},
	navbar: {
		menu: 'Меню',
		start_here: 'Почати',
		login: 'Увійти',
		logout: 'Вийти',
		settings: 'Налаштування',
		profile: 'Профіль',
		language: 'Мова',
		language_select: 'Виберіть мову',
		homepage: 'Головна сторінка',
		online_game: 'Грати онлайн',
		tournaments: 'Турніри',
		start_playing: 'Почати грати',
		fullscreen_mode: 'Повноекранний режим',
		landing_page: 'Головна сторінка',
	},
	play: {
		enter_your_username: 'Введіть своє ім’я користувача',
		start_game: 'Почати гру',
		enter_players_usernames: 'Введіть імена користувачів гравців',
		left_player_input_label: 'Лівий гравець (клавіші W, S)',
		right_player_input_label: 'Правий гравець (клавіші ↑, ↓)',
	},
	settings: {
		title: 'Налаштування профілю',
		profile_picture_instructions: 'Рекомендовано: квадратне зображення, макс. 2.5МБ',
		username_instructions: 'Ім’я користувача повинно бути унікальним та 3-24 символів. Дозволено лише літери, цифри та підкреслення.',
		update: {
			username: {
				title: 'Оновлення імені користувача',
				success: 'Ім’я користувача оновлено успішно',
			},
			avatar: {
				title: 'Оновлення аватару',
				success: 'Аватар оновлено успішно',
			}
		}
	},
	page_titles: {
		play: {
			online: {
				"1v1_game": '1 vs 1 - гра онлайн',
				"1v1_matchmaking": '1 vs 1 Matchmaking - онлайн',
				"tournaments": 'Турніри - онлайн',
			},
			offline: {
				"1vAI": '1 vs AI - оффлайн',
				"1v1": '1 vs 1 - оффлайн',
				"tournaments": 'Турніри - оффлайн',
			}
		}
	},
}
