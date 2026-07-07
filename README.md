# Subtitle Weaver

**Live Demo:** [subtitle-weaver.vercel.app](https://subtitle-weaver.vercel.app/)

A powerful, browser-based tool for burning subtitles and visualizing audio directly onto your videos. Craft perfectly subtitled videos with custom fonts, styles, advanced word-by-word highlighting, and customizable audio waveforms—all without uploading your files to a server.

## Overview

Subtitle Weaver is a client-side video processing application built with Next.js and React. It leverages modern browser APIs like the Canvas, Web Audio, and MediaRecorder APIs to perform all video and audio manipulation directly on the user's machine. This privacy-focused approach means your video files are never sent to a server, ensuring your data remains secure.

Users can upload a video file, a custom font (`.ttf`), and a subtitle file (`.srt` or speech-to-text `.json` word timings). Customize subtitle layouts, color styles, and audio waveforms with a real-time live preview, then weave them into a high-quality WEBM file for download.

---

## Features

- **Client-Side Processing**: All video rendering and audio analysis happen in your browser. No server uploads required.
- **Custom Fonts**: Upload your own `.ttf` font file for complete brand consistency.
- **Live Preview**: See subtitle styling, text wrapping, and audio waveform animations in real time.
- **Sticky Layout**: Keep the video preview and download panel locked in the viewport while you scroll through the configuration sidebar.
- **Rich Subtitle Customization**:
  - Adjust font size and vertical (Y) / horizontal (X) coordinates.
  - Control subtitle text box width boundaries (**Subtitle Max Width** slider) with auto-centering text wrapping.
  - Set custom **Base Text Color** and **Border / Outline Color** properties.
  - Control text opacity and text casing (Normal, ALL CAPS, all lowercase).
- **Word-by-Word JSON Timing Lyrics**:
  - Parses Whisper-style speech-to-text JSON arrays containing word timestamps and durations.
  - Custom highlight animation styles: **Karaoke (Accumulative)**, **Single Word Highlight**, and **Progressive Reveal**.
  - Customizable highlight colors (Gold, Neon Cyan, Neon Green, Hot Pink).
- **Dynamic Audio Waveform Visualizer**:
  - Connects to browser `AudioContext` and `AnalyserNode` to draw frequency data.
  - Waveform styles: **Equalizer Bars**, **Oscilloscope Line**, and **Symmetrical Wave** (centered bass, sloping treble).
  - Customizable horizontal length (width), vertical height, X/Y coordinates, color, and opacity.
  - **Static Mock Waveform Placeholder**: Renders a static mockup when video playback is paused, letting you place and style it easily.
- **Visual Effects**: Apply a custom "Smoke" particle effect to active subtitle lines.
- **Real-Time Export Progress**: Displays weaving progress percentage (e.g., `Weaving Subtitles (45%)...`) on the action button during compilation.
- **High-Quality Output**: Renders video in 1080p WEBM format with a 20 Mbps bitrate.

---

## Technology Stack

- **Framework**: Next.js 16.2.10 (React 19.2.7)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: ShadCN UI
- **Icons**: Lucide React
- **Audio Processing**: Web Audio API (`AudioContext`, `AnalyserNode`)
- **Video Processing**: Browser Canvas API & MediaRecorder API

---

## Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

- [Node.js](https://nodejs.org/) (version 20.x or higher is recommended)
- [npm](https://www.npmjs.com/)

### Installation

1.  **Clone the repository:**
    ```sh
    git clone https://github.com/rashidul-huda/subtitle-weaver.git
    cd subtitle-weaver
    ```

2.  **Install dependencies:**
    ```sh
    npm install
    ```

3.  **Run the development server:**
    ```sh
    npm run dev
    ```

4.  **Open the application:**
    Open [http://localhost:9002](http://localhost:9002) with your browser to see the result.

---

## How It Works

The application uses the browser's built-in capabilities to process video and audio.

1.  **File Handling**: When you upload files, they are stored in the browser's memory.
2.  **Parser Engine**: Parses `.srt` lines or Whisper `.json` word-timestamp arrays into a unified timing ledger.
3.  **Audio Routing**: Routes the video's audio track through `AudioContext` into `AnalyserNode` to capture raw frequency values.
4.  **Canvas Rendering**: When you click "Weave Subtitles", a hidden `<canvas>` element draws the source video frame-by-frame:
    - active subtitles are drawn using your custom alignment, wrapping, outline borders, and color states.
    - active audio frequencies are rendered as animated equalizer bars/waves.
5.  **Video Encoding**: The `MediaRecorder` API captures the canvas stream and connects it to the audio destination node, encoding them into a single high-quality WEBM file in real-time.
6.  **Download**: Once processing completes, a download link is generated for your custom subtitled video.
