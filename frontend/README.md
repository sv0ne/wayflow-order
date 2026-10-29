# Workingdrops order page

Фронтенд на Vite + React + TypeScript. API вынесен отдельно и реализован на Hono: он запускается локально как Node.js сервер, а тот же код можно развернуть как Cloudflare Worker.

## Локальная разработка

```sh
npm install
npm run dev
```

Команда запускает Vite и мок API параллельно. Страница доступна по адресу, который напечатает Vite; локальные `/api/*` запросы проксируются на `http://127.0.0.1:8787`.

Можно запустить части отдельно:

```sh
npm run dev:api
npm run dev:web
```

## API

- `GET /api/order?id=<order-id>` — срок действия, метрики, Top Picks и начальные параметры фильтров.
- `GET /api/sites?search=<text>&offset=0&limit=20` — поиск и постраничная загрузка сайтов.
- `POST /api/metrics` — пересчёт метрик и Top Picks по выбранным фильтрам.
- `POST /api/ads-settings` — сохранение выбора Ads Type в рамках мок-запроса.

Обработчики находятся в `server/app.ts`, тестовые данные — в `mocks/data.ts`. Серверное состояние между вызовами не сохраняется; пользовательская настройка «Always apply» остаётся в `localStorage` браузера.

## Production сборка

```sh
npm run build
```

Фронтенд собирается в `dist/` и может быть опубликован отдельно на Vercel, Cloudflare Pages или любом статическом хостинге. В проекте нет Vercel SDK или конфигурации.

Чтобы подключить отдельно размещённый API, задай `VITE_API_BASE_URL` перед сборкой фронтенда, например `https://wayflow-order-api.<account>.workers.dev`. Для локальной разработки оставь переменную пустой: Vite использует свой proxy.

## Размещение мок API на Cloudflare Workers

После входа в Cloudflare через Wrangler:

```sh
npx wrangler login
npm run deploy:api:cloudflare
```

API Worker настраивается файлом `wrangler.toml`. При публикации фронтенда добавь `VITE_API_BASE_URL` в переменные сборки Vercel или Cloudflare Pages. Настроенный в API CORS разрешает запросы с разных origin для демонстрационного мока; при подключении настоящего backend его следует ограничить доменом фронтенда.
