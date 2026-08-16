# Monday setup — 10 minutes

Do these once on your PC. After this you can work from your phone.

## 1. Install Node.js
Download the **LTS** version from https://nodejs.org and run the installer.
Check it worked — open Terminal (Mac) or Command Prompt (Windows):
```
node -v
```
You should see a version number.

## 2. Unzip this project
Put the `zombie-ants` folder wherever you keep your files.

## 3. Install and run
In Terminal, from inside the folder:
```
npm install
npm test        # should say 51 passed
npm run dev     # open the link it prints
```

## 4. Push to GitHub
```
git init
git add .
git commit -m "Restructure: TypeScript engine + AI with tests"
git branch -M main
git remote add origin https://github.com/ilebaca/zombie-ants.git
git push -u origin main --force
```
(`--force` because this replaces the old single-file layout. The old build is preserved
in `legacy/` so nothing is lost.)

## 5. Connect Claude
Go to **claude.ai/code**, connect your GitHub account, and pick the `zombie-ants` repo.

That's it. From then on you can start sessions from your phone, and Claude reads
`CLAUDE.md` automatically at the start of each one.

## Anything breaks?
Copy the error text into a chat with Claude. Don't try to debug it yourself.
