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

See base class implementations in `src/types/pages.ts`.

### Lifecycle Methods

Controllers can implement the following lifecycle methods:

- `preRender()` (optional): Called before `render()`, useful for fetching data or preparing the view.
- `render()`: Returns the view's HTML content.
- `postRender()` (optional): Called after `render()`, typically used for binding events or post-processing.

Example controllers:
- `src/pages/HomeController.ts`
- `src/pages/LandingPageController.ts`

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
