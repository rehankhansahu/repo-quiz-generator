# Repo Quiz Generator

Generate code-grounded multiple-choice quizzes (MCQs) from any GitHub repository using the **Google Gemini API** directly in the browser.

Unlike generic quiz tools that only read a `README.md`, **Repo Quiz Generator** fetches and analyzes the entire codebase — source files, configurations, scripts, tests, manifests, and documentation — builds a project map, and generates questions strictly grounded in real code with exact `sourceFile` references.

> **Security & Privacy Reminder:** Your Google Gemini API key and optional GitHub Personal Access Token are entered by you in the browser and stored **only in your own browser's `localStorage`**. They are never committed to this repository and are sent strictly to the official GitHub and Google Gemini APIs.

---

## Features

- **Full-Codebase Analysis:** Recursively fetches the GitHub tree, filters out build artifacts (`node_modules`, `dist`, `.git`), lock files, binaries, images, and oversized generated files, and downloads files concurrently with retries and rate-limit handling.
- **Project Map & Map-Reduce Pipeline:** Builds a static project map (folder structure, languages, entry points, modules, functions/classes, dependencies, import graph). Sends the full codebase directly when it fits in Gemini's context window, or automatically switches to a module-based **Map-Reduce** pipeline for large repositories.
- **Quiz Modes:**
  - **Quick Quiz:** Fixed 3 questions (`1 Easy`, `1 Medium`, `1 Hard`).
  - **Custom Quiz:** Set any total (1–30) and specify exact Easy, Medium, and Hard counts with live validation (`X / Y assigned`).
- **Languages:**
  - **English**
  - **Hinglish:** Natural Roman-script Hindi/Urdu mixed with English (never Devanagari or Urdu script), preserving all code identifiers and technical terms.
- **Structured & Validated Output:** Uses Gemini structured JSON (`responseMimeType: "application/json"` + `responseSchema`) with validation for file grounding, uniqueness, no filler options, Hinglish script compliance, and exact difficulty counts.
- **Interactive Quiz & Results:** One question at a time, instant answer explanations + source file paths, score breakdown by difficulty, full review, **Retake Quiz**, and **Generate New Quiz**.
- **Light & Dark Themes:** Defaults to your OS preference and remembers your toggle in `localStorage`.

---

## Local Setup & Development

### Prerequisites
- Node.js 18+ (Node 20 recommended)
- A Google Gemini API key from [Google AI Studio](https://aistudio.google.com/)

### Run Locally
```bash
git clone https://github.com/<your-username>/repo-quiz-generator.git
cd repo-quiz-generator
npm install
npm run dev
```

Run tests and production build:
```bash
npm test
npm run build
npm run preview
```

---

## Usage

1. **API Keys:** Enter your Google Gemini API key once (plus an optional GitHub token for private repos or 5,000 req/hr rate limits). Keys persist in `localStorage` and skip asking on subsequent visits; you can update or remove them anytime via **API Keys** in the header.
2. **Repo URL:** Paste a GitHub repository URL (e.g. `https://github.com/expressjs/express`) and optional branch.
3. **Quiz Mode:** Choose **Quick Quiz** (3 questions) or **Custom Quiz** and assign exact Easy/Medium/Hard counts.
4. **Language:** Select **English** or **Hinglish**.
5. **Generate & Play:** Watch live file fetch progress and the Project Map snapshot, then answer questions one by one and review your score breakdown.

---

## Deploying to GitHub Pages

This project includes a ready-to-use GitHub Actions workflow at `.github/workflows/deploy.yml` and automatic sub-path handling in `vite.config.js`.

### Step-by-Step Deployment
1. **Create a new repository** on GitHub (for example, `repo-quiz-generator`).
2. **Push this project** to the `main` branch:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Repo Quiz Generator"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo-name>.git
   git push -u origin main
   ```
3. **Enable GitHub Pages via GitHub Actions:**
   - Open your repository on GitHub.
   - Go to **Settings → Pages**.
   - Under **Build and deployment → Source**, choose **GitHub Actions**.
4. **Find your live URL:**
   - Open the **Actions** tab and wait for **Deploy to GitHub Pages** to complete.
   - Once finished, your live URL appears directly in the **deploy** job summary (and under **Settings → Pages**) at:
     `https://<your-username>.github.io/<your-repo-name>/`

> **Note on `base` path:** `vite.config.js` automatically reads `GITHUB_REPOSITORY` during GitHub Actions builds so asset paths resolve accurately for whatever repository name you choose (and defaults to `/repo-quiz-generator/` locally).
>
> **Important:** Never commit API keys or tokens into `.env` or source code. Each visitor enters their own Gemini API key (and optional GitHub token) in the app UI, where it is stored strictly in their own browser's `localStorage`.
