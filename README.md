# ReServe
Spoilage Clock for surplus food: every item auto-cascades people > discounted sale > animal feed > compost. Live on Firebase.
Live Demo link :- https://re-serve-beige.vercel.app/

## Setup
1. Firebase console: create a project, add a Web app, copy the config into `.env.local` (template: `.env.example`).
2. Build > Authentication > Sign-in method > enable **Email/Password**.
3. Build > Firestore Database > Create database (production mode). Then Rules tab > paste `firestore.rules` > Publish.
4. `npm install && npm run dev`
5. Deploy: push to GitHub, import in Vercel, add the same six `VITE_FIREBASE_*` variables, redeploy.
6. Firebase > Authentication > Settings > Authorized domains: add your `*.vercel.app` domain.

## Collections
- `orgs/{uid}`: name, role (giver|receiver), type (receivers only), lat, lng. Edit these in the console to manage organisations.
- `items/{id}`: posted surplus. Stage is calculated from `postedAt` + `shelfH`, never stored.
- `mess/{giverUid}` and `mess/{giverUid}/votes/{uid}`: planner and diner replies.

## Demo tip
Post an item with a short shelf life (for example 0.1 hours = 6 minutes) to watch the cascade in a minute or two.
