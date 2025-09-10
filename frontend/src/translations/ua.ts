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
	}
}
