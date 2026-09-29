/* N!TRO Activity Monitor — configuration
   ------------------------------------------------------------
   LIVE MODE (the whole team shares one HQ):
   1. Create a free Firebase project at https://console.firebase.google.com
   2. Add a Web app, copy its config object and paste the values below.
   3. Enable Authentication → Sign-in method → Email/Password.
   4. Create a Firestore database (production mode) and paste firestore.rules
      into Firestore → Rules → Publish.
   5. Upload the site to GitHub Pages. Done. (Full guide: DEPLOY.md)

   Until apiKey is filled in, the HQ runs in LOCAL DEMO MODE: everything works
   on this device only and nothing is shared.
   ------------------------------------------------------------ */
window.NITRO_HQ_CONFIG = {
  firebase: {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  },

  /* The live countdown shown on every screen. */
  countdown: {
    target: "2027-07-28T00:00:00+05:30",
    label: "28 July 2027",
    sub: "Season 2027 · every second counts"
  },

  /* Where the emblem in the sidebar links back to. */
  siteUrl: "../index.html",

  /* Money meter target in rupees. */
  moneyTarget: 300000,

  /* The team. In live mode each person registers with their own email; the
     name they register with must match here for the locked portfolio sliders
     to recognise them (matching ignores capital letters). */
  team: [
    { name: "Aariv",   role: "Marketing · Sponsorship · Digital Presence" },
    { name: "Aryeh",   role: "Manufacturing · Co-Design · Technical Lead" },
    { name: "Rehnuma", role: "Design · Co-Manufacturing" },
    { name: "Vivaan",  role: "Aerodynamics · Non-Technical Lead · Resources" },
    { name: "Aarna",   role: "Project Manager · Graphics · Portfolio Head" },
    { name: "Anay",    role: "Senior Consultant" }
  ],

  /* Team progress meters — anyone can update these. Rename inside the app. */
  meters: [
    { id: "verbal",        label: "Verbal presentation",        unit: "percent" },
    { id: "design",        label: "Car design",                 unit: "percent" },
    { id: "car-mfg",       label: "Car manufacturing",          unit: "percent" },
    { id: "pit",           label: "Pit display design",         unit: "percent" },
    { id: "money",         label: "Money raised",               unit: "inr" },
    { id: "outreach",      label: "N!TRO outreach initiatives", unit: "percent" },
    { id: "manufacturing", label: "Manufacturing",              unit: "percent" }
  ],

  /* Portfolio sliders — each one can ONLY be moved by its owner.
     "Total portfolio" is the average of these three. */
  portfolio: [
    { id: "pf-pm",         label: "PM portfolio",                 owner: "Aarna" },
    { id: "pf-enterprise", label: "Enterprise portfolio",         owner: "Aariv" },
    { id: "pf-design",     label: "Design & Engineer portfolio",  owner: "Aryeh" }
  ]
};
