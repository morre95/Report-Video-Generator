# Report Video Generator

Transform reports and documents into animated video presentations with AI-generated narration.

## Features

- **Document Upload** — Drag-and-drop PDF, DOCX, TXT, or Markdown files
- **AI Analysis** — Gemini extracts key metrics, charts, and creates a narration script
- **Voiceover** — Gemini TTS generates professional narration with configurable voices
- **Animated Compositions** — Hyperframes renders HTML/CSS/GSAP compositions with charts, KPIs, and transitions
- **Background Music** — Lofi background music mixed at reduced volume under the voiceover
- **Configurable** — Duration (15–300s), aspect ratio (16:9, 4:3, 9:16, 1:1), FPS, voice selection
- **NVIDIA Demo** — Pre-loaded Q1 FY2027 earnings demo

## Requirements

- **Node.js 22+** — [nodejs.org](https://nodejs.org/)
- **FFmpeg** — `sudo apt install ffmpeg` (Debian/Ubuntu) or `brew install ffmpeg` (macOS)
- **Gemini API Key** — [Google AI Studio](https://aistudio.google.com/apikey)

## Setup

```bash
# Install dependencies
npm install

# Copy environment template and add your API key
cp .env.example .env.local
# Edit .env.local with your GEMINI_API_KEY

# Verify Hyperframes dependencies
npx hyperframes doctor

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Usage

1. Upload a report or click **Load NVIDIA Q1 FY2027 Demo**
2. Write a presentation brief describing the story you want
3. Adjust duration, aspect ratio, FPS, and voice
4. Click **Generate Video**
5. Preview the composition in-browser or download the HTML
6. Render to MP4: `npx hyperframes render composition.html -o output.mp4`

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
    gemini/
      analyze.ts          # Report → structured presentation JSON
      tts.ts              # Narration → voiceover audio
    hyperframes/
      build-composition.ts  # Presentation data → animated HTML
      render.ts             # HTML → MP4 via Hyperframes CLI
    jobs/                 # In-memory job store
data/demos/               # Pre-built demo fixtures
public/audio/             # Background music (lofi7.mp3)
.runtime/                 # Uploads, compositions, audio, renders (gitignored)
```
