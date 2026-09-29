# Putting Team N!TRO online — step by step

Two things go live: the **website** (this whole folder) and the **Activity
Monitor** inside `hq/`. GitHub Pages hosts both for free. The Activity Monitor
also needs a free Firebase project so the team shares one HQ — that is the
"server". About 25 minutes in total, no coding.

You need: a GitHub account (github.com) and a Google account (for Firebase).

---

## Part 1 — Put the site on GitHub (10 min)

**Using GitHub Desktop (easiest, and best for updating later)**

1. Install GitHub Desktop from <https://desktop.github.com> and sign in.
2. **File → Add Local Repository…** → choose this folder → GitHub Desktop
   will say it isn't a repository yet → click **create a repository**.
   Name: `teamnitro` (or anything). Leave the other boxes as they are → **Create Repository**.
3. In the top bar click **Publish repository**. Untick **Keep this code private**
   (GitHub Pages on a free account needs the repo to be public) → **Publish**.
4. On github.com open the repository → **Settings → Pages**.
   Under *Build and deployment* set **Source: Deploy from a branch**,
   **Branch: main**, folder **/ (root)** → **Save**.
5. Wait a minute, refresh the Pages settings, and the live address appears:
   `https://YOUR-USERNAME.github.io/teamnitro/`
   The Activity Monitor is at `https://YOUR-USERNAME.github.io/teamnitro/hq/`

**Alternative — upload in the browser (no install)**

1. github.com → **+** (top right) → **New repository** → name it, **Public** → **Create**.
2. On the empty repository page click **uploading an existing file**.
3. Drag the *contents* of this folder (not the folder itself) into the page —
   folders drag in with their structure intact — then **Commit changes**.
4. Continue from step 4 above.

**Updating the site later:** change the files, then in GitHub Desktop write a
short summary, **Commit to main**, **Push origin**. The live site updates in
about a minute.

---

## Part 2 — Create the server for the Activity Monitor (15 min)

Firebase is Google's free backend. It gives the HQ sign-in and a shared,
real-time database. Nothing to install and no card needed.

1. Go to <https://console.firebase.google.com> → **Create a project**.
   Name it `teamnitro-hq`. Turn Google Analytics **off** → **Create project**.
2. On the project home click the **`</>`** (Web) icon → App nickname
   `Team HQ` → **Register app**. It shows a block like:

   ```js
   const firebaseConfig = {
     apiKey: "AIza…",
     authDomain: "teamnitro-hq.firebaseapp.com",
     projectId: "teamnitro-hq",
     storageBucket: "teamnitro-hq.firebasestorage.app",
     messagingSenderId: "1234…",
     appId: "1:1234…:web:…"
   };
   ```

   Open **`hq/js/config.js`** and paste each value into the matching empty
   `""` in the `firebase:` block. Save. (These values are safe to publish;
   the security rules in step 5 are what protect the data.)
3. Left menu **Build → Authentication → Get started** →
   **Sign-in method → Email/Password → Enable → Save**.
4. **Build → Firestore Database → Create database** → keep **Production mode**
   → pick the region nearest Delhi (`asia-south1` Mumbai) → **Create**.
5. Open the **Rules** tab. Delete everything in the editor, open
   **`hq/firestore.rules`** from this folder, paste its whole contents in →
   **Publish**. These rules are what make private groups private, stop anyone
   but the assignee changing a task's status, and lock each portfolio slider
   to its owner.
6. **Authentication → Settings → Authorized domains → Add domain** →
   `YOUR-USERNAME.github.io` → **Add**.
7. Commit and push the changed `config.js` (Part 1, "Updating the site later").

Open the live HQ. The sign-in box now says **Live team HQ · synced for everyone**.

---

## Part 3 — Get the team in (5 min)

1. Each member opens the HQ link and presses **Create account**.
2. They enter their **name exactly as the team knows them** (Aarna, Aariv,
   Aryeh, Rehnuma, Vivaan, Anay — the list is in `hq/js/config.js`), their
   email and a password of their choice. The name is fixed after registration;
   it is what unlocks the portfolio sliders (Aarna → PM, Aariv → Enterprise,
   Aryeh → Design & Engineer).
3. Once everyone has registered, close the door so nobody else can join:
   Firebase → **Authentication → Settings → User actions → untick
   "Enable create (sign-up)" → Save**. Existing accounts keep working.

If someone forgets a password: Firebase → **Authentication → Users → ⋮ →
Reset password** (sends them an email).

---

## Changing things later

| What | Where |
|------|-------|
| Countdown date | `hq/js/config.js` → `countdown` |
| Money target | `hq/js/config.js` → `moneyTarget` |
| Team list / roles | `hq/js/config.js` → `team` |
| Meter names | `hq/js/config.js` → `meters`, or rename inside the app |
| Portfolio owners | `hq/js/config.js` → `portfolio` (change `owner` to a registered name) |
| Wipe all shared data | Firebase → **Firestore → Data** → delete the collections you want cleared (`tasks`, `events`, `conversations`, `meterUpdates`); meters reset to 0 if you delete `meters` |
| Remove a member | Firebase → **Authentication → Users → ⋮ → Delete account** |

## Before Firebase is set up

The HQ runs in **Local demo mode**: sign in with just a name, everything works,
but only on that one device, and nothing is shared. Use it to try things out.
The link at the bottom of the sign-in card resets that device's demo data.
