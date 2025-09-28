# Talk With Eyes

A React application that allows people to communicate using eye tracking. This application uses a phonetic wheel interface that works with webcam-based eye tracking to let users spell out words, which are then processed by OpenAI to convert phonetic inputs into natural language.

## Features

- Eye tracking using GazeCloudAPI
- Phonetic wheel interface for intuitive letter selection
- OpenAI integration to convert phonetic inputs to natural language
- Support for multiple languages
- Calibration system to improve accuracy
- Dwell-based selection (looking at a letter for a set amount of time selects it)peScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## How It Works

1. The application uses your webcam to track eye movements
2. Look at letters on the phonetic wheel to spell out words
3. When you look at a letter for a sufficient amount of time (dwell), it gets selected
4. Look at the center "Submit" button to send your phonetic input to OpenAI
5. OpenAI processes your phonetic input and converts it to natural language

## Getting Started

### Prerequisites

- A webcam is required for eye tracking
- An OpenAI API key for language processing

### Installation

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Start the development server:
   ```
   npm run dev
   ```

### Usage

1. Enter your OpenAI API key when prompted
2. Click "Start Eye Tracking" and follow the calibration instructions
3. Look at letters on the wheel to spell out words
4. When finished, look at the "Submit" button to process your input

## Technologies Used

- React with TypeScript
- Vite for fast development
- GazeCloudAPI for eye tracking
- OpenAI API for language processing
```
