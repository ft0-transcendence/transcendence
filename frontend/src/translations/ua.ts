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
		incoming_friend_requests: 'Вхідні запити на дружбу',
		friend_requests: 'Запити на дружбу',
		no_friend_requests: 'Немає запитів на дружбу',
		remove_friend: 'Видалити друга',
		remove_friend_confirm: 'Ви впевнені, що хочете видалити {{username}} зі своєї списку друзів? Цю дію неможливо скасувати.',
		confirm: 'Підтвердити',
		cancel: 'Скасувати',
		remove_friend_success: 'Друг успішно видалений',
		hide: 'Сховати',
		show: 'Показати',
		sent_friend_requests: 'Відправлені запити на дружбу',
		cancel_friend_request: 'Скасувати запит на дружбу',
		cancel_friend_request_confirm: 'Ви впевнені, що хочете скасувати цей запит на дружбу з вашого списку друзів? Цю дію неможливо скасувати.',
		wins: 'Перемоги',
		losses: 'Поразки',
		tournaments_won: 'Турніри виграно',
		played_games: 'Гри зіграно',
		win_rate: '% Виграшів',
		tournaments: 'Турніри',
		join_tournament: 'Приєднатися до турніру',
		create_tournament: 'Створити турнір',
		tournament_name: 'Назва турніру',
		start_date_and_time: 'Дата та час початку',
		max_participants: 'Максимальна кількість учасників',
		tournament_name_placeholder: 'назва турніру',
		countdown: {
			hours_minutes: 'через {{hours}}г {{minutes}}х',
			minutes_seconds: 'через {{minutes}}х {{seconds}}с',
			started: '...',
		},
		already_joined_troll_description: "Хороша попроба, але ви вже у турнірі. Ви не можете зайти двічі.",
		already_left_troll_description: "Хороша попроба, але ви вже вийшли з турніру. Ви не можете залишити турнір, на якому не зареєстровані.",
		leave_tournament: "Вийти з турніру",
		tournamentList: {
			join: "Приєднатися",
			leave: "Вийти",
			registered: "Зареєстровано",

		},
		leave_tournament_success: "Ви успішно вийшли з турніру",
		create: "Створити",
		tournament: "Турнір",
	},
	error: {
		generic_server_error: 'Щось пішло не так. Будь ласка, спробуйте ще раз пізніше.',
	},
	game: {
		player_disconnected: 'Гравець {{playerName}} від\'єднався',
		time_left_before_forfeit: 'Автоматична перемога через {{timeLeftMs}} секунд',
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
		online_tournaments: 'Онлайн турніри',
	},
	play: {
		enter_your_username: 'Введіть своє ім’я користувача',
		start_game: 'Почати гру',
		enter_players_usernames: 'Введіть імена користувачів гравців',
		left_player_input_label: 'Лівий гравець (клавіші W, S)',
		right_player_input_label: 'Правий гравець (клавіші ↑, ↓)',
		right_player_input_placeholder: 'правий гравець',
		left_player_input_placeholder: 'лівий гравець',
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
