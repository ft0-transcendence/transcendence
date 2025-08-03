# FT0 Frontend

This folder contains the frontend code for the application.

## Running the Application

To run the frontend in development mode:
```bash
npm run dev:frontend
```

## Routing

The application uses a custom routing system with a single-page application (SPA) architecture. The router is defined in `src/pages/_router.ts` and is responsible for handling route changes and rendering the appropriate views.

The router is a singleton and can be accessed globally via `window.router` or via an imported `router` variable.

### Available Methods

- `init()`: Initializes the router. Call this once when the app is ready.
- `navigate(path: string)`: Navigates to the specified route. If not already on the target page, it updates the URL and renders the new view.
- `currentController`: Returns the currently active controller instance.
- `changeLoadingState(isLoading: boolean)`: Manually updates the application's loading state. Internally tracks a counter of active loading requests:
	- Each call with `true` increments the counter.
	- Each call with `false` decrements it.
	- The loading spinner is shown if the counter is greater than 0 and hidden when it reaches 0.

## Controllers

Controllers manage view rendering logic. They extend a base `ViewController` class and come in two types:

- `RouteController`: Handles full page views.
- `LayoutController`: Handles wrapping layouts (e.g., headers, sidebars).
- `ComponentController`: Handles components that are not full page views.

See base class implementations in `src/types/pages.ts`.

### Lifecycle Methods

Controllers can implement the following lifecycle methods:

- `preRender()` (optional): Called before `render()`, useful for fetching data or preparing the view.
- `render()`: Returns the view's HTML content.
- `postRender()` (optional): Called after `render()`, typically used for binding events or post-processing.


Example controllers:
- `src/pages/HomeController.ts`
- `src/pages/LandingPageController.ts`
- `src/components/LanguageSelector.ts`


#### Child Components

You can register child components and render them in the `render()` method.
The procedure would be the following:

1. Create a new class that extends `ComponentController`.
2. Register the component by calling `registerChildComponent(<ChildrenComponent>)`, which returns the child's instance. That way the parent can call automatically `postRender()` on the child. after the parent's `postRender()`.
3. Render the component in the `render()` method with `silentRender()` method of that child component (it will return the view without rendering it).
4. The destroy method of the child component is automatically called when the parent is destroyed.

Usage example:
```ts
import { LanguageSelectorComponent } from '../components/LanguageSelector';

export class BaseLayout extends LayoutController {
	async render() {
		const languageSelector = new LanguageSelectorComponent();
		this.registerChildComponent(languageSelector);

		return /*html*/`
			${await languageSelector.silentRender()}
		`;
	}
}
```

## Pages

The `src/pages` folder contains controllers for all routeable pages.

To add a new page:

1. Create a new class that extends `RouteController`.
2. Register the route in the `routes` array in `src/pages/_router.ts`.

Each route object can have the following properties:

- `path`: The URL path of the page.
- `newController`: A function that returns a new instance of the controller.
- `authRequired` (optional): Whether the page requires authentication.
- `newLayout` (optional): A function that returns a layout controller instance.

Example:

```ts
export const routes: Route[] = [
  {
    path: '/home',
    newController: () => new HomeController(),
    authRequired: true,
  },
];
```

## Layouts

Layouts wrap the page content and can be defined per route.

To use a layout:
1. Create a new class that extends `LayoutController`.
2. Add it to the `newLayout` property of the relevant route.

Example:
```ts
import { LandingPageController } from "./LandingPageController";
import { BaseLayout } from "../layouts/BaseLayout";

export const routes: Route[] = [
  {
    path: '/',
    newController: () => new LandingPageController(),
    newLayout: () => new BaseLayout(),
  },
];
```

## Translations

The application uses the [i18next](https://www.i18next.com/) library for translations and some custom implementations on top of it.

### Adding a new language

To add a new language, you need to:

1. Define the language in the `AppLanguage` enum in `src/tools/i18n.ts`. From there you'll see many error squiggles, which will help you to understand what next you need to add.
2. Create a new translation file in `src/translations`. The file name can be anything, but it's recommended to use the ISO 639-1 language code (e.g., `en.ts` for English, `it.ts` for Italian, etc.). The file should export a `TranslationSchema` object (which is imported from `src/translations/en.ts`).
3. Configure `allLanguagesDefinition` and `allTranslations` with the new language in `src/tools/i18n.ts`.
4. And you're done!

### Adding a new translation key

Every translations are defined in the `TranslationSchema` object. This type if infered from the `en.ts` file, so you should start everytime from that language file, so the other languages will be able to use the same keys.


Example:
```ts
// es.ts
import { TranslationSchema } from "./en";
export const es: TranslationSchema = {
	hello:{
		world: "Hola {{name}}",
	}
	//...
}
```

### Using the translations

You can use the translations programmatically or by adding the `data-i18n` attribute to the HTML element, which will populate the element's text with the translation for the given key.
The translation file supports the deeply nested keys, and to use it you just need to write the key in the dot notation (e.g., `hello.world`).

If the translation is not found, nothing will happen (no error, no warning, nothing; probably a bug)

#### Programmatically

If you want to use the translations programmatically (get a translated string) you can use the `t` function from `src/tools/i18n.ts`.

Example:
```ts
import { t } from "../tools/i18n";

const msg = t('hello.world');
```

#### Using the `data-i18n` attribute

If you want to use the translations by adding the `data-i18n` attribute to the HTML element, you just have to add it to the element and set the value to the key of the translation. Hovewer this is not recommended, as it's not type-safe, you **should** use the `k` function to retrieve the key.

Suggested usage (inside a ViewController `render()` method):
```html
<div data-i18n="${k('hello.world')}">Hello World</div>
```

#### String interpolation

The translations also support string interpolation, and that means that you can use the `{{variable}}` syntax to insert the value of a variable into the translation.
To valorize the variable, you can use the `t`'s second argument, which is an object with the variables to valorize, or in the html attribute, you can use the `data-i18n-vars` attribute, which is a JSON string with the variables to valorize (bad practice, but it's supported).

Suggested usage (inside a ViewController `render()` method):
```html
<div data-i18n="${k('hello.world')}" data-i18n-vars='{"name": "Sasha"}'>Hello {{name}}</div>
```

or with the `t` function:
```ts
const msg = t('hello.world', { name: 'Sasha' });
```
