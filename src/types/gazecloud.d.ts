// Type definitions for WebGazer and compatibility layer
interface GazeData {
  state: number; // 0: valid gaze data; -1: face tracking lost, 1: gaze uncalibrated
  docX: number; // gaze x in document coordinates
  docY: number; // gaze y in document coordinates
  time: number; // timestamp
  GazeX: number;
  GazeY: number;
  HeadX: number;
  HeadY: number;
  HeadZ: number;
  HeadYaw: number;
  HeadPitch: number;
  HeadRoll: number;
}

interface WebGazerPrediction {
  x: number;
  y: number;
}

interface WebGazerInterface {
  begin(): Promise<void>;
  end(): WebGazerInterface;
  pause(): WebGazerInterface;
  resume(): WebGazerInterface;
  setGazeListener(callback: (data: WebGazerPrediction | null, elapsedTime: number) => void): WebGazerInterface;
  clearGazeListener(): WebGazerInterface;
  getCurrentPrediction(): WebGazerPrediction | null;
  setTracker(tracker: string): WebGazerInterface;
  setRegression(regression: string): WebGazerInterface;
  recordScreenPosition?(x: number, y: number, eventType: string): void;
  util: {
    bound(prediction: WebGazerPrediction): WebGazerPrediction;
  };
  params: {
    showVideo: boolean;
    showGazeDot: boolean;
    showFaceOverlay: boolean;
    showFaceFeedbackBox: boolean;
  };
}

declare global {
  interface Window {
    webgazer: WebGazerInterface;
    saveDataAcrossSessions: boolean;
  }
}

export {};