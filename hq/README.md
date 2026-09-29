# N!TRO Activity Monitor (Team HQ)

The private team dashboard for Team N!TRO: live countdown, progress meters,
chat, tasks and the team calendar. It is a static site, so it runs on
GitHub Pages with no server of its own.

It has two modes:

| Mode | What it does | How to get it |
|------|--------------|---------------|
| **Local demo** | Everything works on one device only. Nothing is shared. | The default. Just open `index.html`. |
| **Live** | The whole team shares one HQ, in real time: chat, typing bubbles, tasks, meters, calendar. | Add a free Firebase project (10 minutes, below). |

## Going live

The full click-by-click guide is **`../DEPLOY.md`** (GitHub Pages + Firebase).
Short version:

1. Go to <https://console.firebase.google.com>, sign in with a Google account
   and **Add project** (any name, Analytics off is fine).
2. In the project, click the **Web** icon (`</>`) to add a web app. Copy the
   `firebaseConfig` values it shows into `js/config.js`.
3. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable.**
4. **Build → Firestore Database → Create database** (production mode, any region).
5. Open **Firestore → Rules**, delete what is there, paste the contents of
   `firestore.rules`, and **Publish**. These rules are what make private
   groups private and what stops anyone but the assignee changing a task's status.
6. Upload this `hq` folder to GitHub (as part of the website repo, or on its own)
   and turn on GitHub Pages for the repo (**Settings → Pages → Deploy from a branch**).
7. Send the team the link. Each member presses **Create account** the first time.

After the whole team has registered, you can stop strangers signing up:
**Authentication → Settings → User actions → untick "Enable create (sign-up)"**.

Firebase's free plan is far more than a team of six will ever use.

## Changing things

- **Countdown date and label** — `countdown` in `js/config.js`.
- **Money target** — `moneyTarget` in `js/config.js` (rupees).
- **Team roster and roles** — `team` in `js/config.js`.
- **Meter names** — either edit `meters` in `js/config.js` before going live, or
  rename a meter from inside the app (tap the meter → "Rename meter").
- **Portfolio sliders and their owners** — `portfolio` in `js/config.js`. Each
  slider moves only for the member whose registered name matches `owner`;
  "Total portfolio" is their average.
- **The link from the main website** — `index.html` in the site root links to
  `hq/index.html`. If you host the HQ somewhere else, change that one `href`
  (search for "Activity Monitor link").

## Files

```
index.html          the app shell
css/hq.css          design (Nitro Navy, Vanilla, Diva Pink, Grape Mint)
js/config.js        Firebase config, countdown, money target, default meters
js/store.js         data layer: Firebase (live) and localStorage (demo)
js/hq.js            the interface
firestore.rules     security rules to paste into Firebase
assets/, fonts/     brand marks and Glacial Indifference
```
