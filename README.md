# Report Video Generator

Transform reports and documents into animated video presentations with AI-generated narration.

## Features

- **Multi-Document Upload** — Drag-and-drop up to 10 PDF, DOCX, TXT, or Markdown files (20 MB each, 50 MB combined). Sources are deduplicated and text is balanced across a 200K-character budget so later files are not discarded.
- **AI Analysis** — Gemini 3.5 Flash through OpenRouter extracts key metrics, charts, and creates a narration script
- **Optional Web Research** — Tick "Allow online research" to let the AI search the web for supplementary context. Uploaded documents remain the primary source. Adds a small OpenRouter web-search charge per query.
- **Voiceover** — Gemini 3.1 Flash TTS through OpenRouter generates professional narration with configurable voices
- **Animated Compositions** — Hyperframes renders HTML/CSS/GSAP compositions with charts, KPIs, and transitions
- **Background Music** — Selectable background music mixed at reduced volume under the voiceover
- **Configurable** — Duration (15–300s), aspect ratio (16:9, 4:3, 9:16, 1:1), FPS, voice selection
- **NVIDIA Demo** — Pre-loaded Q1 FY2027 earnings demo

## Requirements

- **Node.js 22+** — [nodejs.org](https://nodejs.org/)
- **FFmpeg** — `sudo apt install ffmpeg` (Debian/Ubuntu) or `brew install ffmpeg` (macOS)
- **OpenRouter API Key** — [OpenRouter Keys](https://openrouter.ai/keys) with available credits

## Setup

```bash
# Install dependencies
npm install

# Copy environment template and add your API key
cp .env.example .env.local
# Edit .env.local with your OPENROUTER_API_KEY

# Verify Hyperframes dependencies
npx hyperframes doctor

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Usage

1. Upload one or more reports (up to 10 files) or click **Load NVIDIA Q1 FY2027 Demo**
2. Write a presentation brief describing the story you want
3. Optionally enable **Allow online research** for supplementary web context (adds OpenRouter search charges)
4. Adjust duration, aspect ratio, FPS, voice, and background music
5. Click **Generate Video**
6. Preview the video in-browser or download the MP4

## Architecture

```
src/
  app/                    # Next.js App Router
    api/
      jobs/               # Job creation and status polling
      demo/               # NVIDIA demo data endpoint
    page.tsx              # Main UI
  lib/
    config/               # Server-only configuration
    documents/            # PDF, DOCX, TXT extraction
    gemini/                 # Presentation analysis and TTS orchestration
      analyze.ts          # Report → structured presentation JSON
      tts.ts              # Narration → voiceover audio
    openrouter/
      client.ts           # OpenRouter authentication, models, and errors
    hyperframes/
      build-composition.ts  # Presentation data → animated HTML
      render.ts             # HTML → MP4 via Hyperframes CLI
    jobs/                 # In-memory job store
data/demos/               # Pre-built demo fixtures
public/audio/             # Background music (lofi7.mp3)
.runtime/                 # Uploads, compositions, audio, renders (gitignored)
```
