import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { CalibrationOverlay } from '../components/CalibrationOverlay';

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

type TrackingStatus =
  | 'inactive'
  | 'active'
  | 'calibrating'
  | 'reconnecting'
  | 'denied'
  | 'error';

interface UseEyeTrackingReturn {
  gazeData: GazeData | null;
  status: TrackingStatus;
  startTracking: () => void;
  stopTracking: () => void;
  error: string | null;
  calibrationOverlay: React.ReactNode;
}


const AUTO_RESTART_THRESHOLD = 25000;
const HEALTH_CHECK_INTERVAL = 4000;
const RESTART_DELAY = 250;
const GAZE_HISTORY_MS = 1200;
const MAX_HISTORY_POINTS = 120;
const FIXATION_WINDOW_MS = 650;
const FIXATION_MIN_DURATION_MS = 320;
const FIXATION_MAX_RADIUS_PX = 35;
const MIN_FIXATION_SAMPLES = 6;
const SMOOTH_MIN_ALPHA = 0.2;
const SMOOTH_MAX_ALPHA = 0.85;
const MAX_VELOCITY_PX_PER_S = 2000;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));



export const useEyeTracking = (): UseEyeTrackingReturn => {
  const [gazeData, setGazeData] = useState<GazeData | null>(null);
  const [showCalibration, setShowCalibration] = useState(false);


  const [status, setStatus] = useState<TrackingStatus>('inactive');
  const [error, setError] = useState<string | null>(null);
  const isManuallyStoppedRef = useRef(true);
  const hasCalibratedRef = useRef(false);
  const restartingRef = useRef(false);
  const restartTimerRef = useRef<number | null>(null);
  const healthIntervalRef = useRef<number | null>(null);
  const lastResultRef = useRef<number | null>(null);
  const gazeHistoryRef = useRef<Array<{ x: number; y: number; time: number }>>([]);
  const smoothedPointRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const clearHealthInterval = useCallback(() => {
    if (healthIntervalRef.current) {
      window.clearInterval(healthIntervalRef.current);
      healthIntervalRef.current = null;
    }
  }, []);

  const resetSmoothingState = useCallback(() => {
    gazeHistoryRef.current.length = 0;
    smoothedPointRef.current = null;
  }, []);

  const computeFilteredGazePoint = useCallback(
    (rawX: number, rawY: number, timestamp: number): { x: number; y: number } => {
      if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) {
        return { x: rawX, y: rawY };
      }

      const history = gazeHistoryRef.current;
      history.push({ x: rawX, y: rawY, time: timestamp });

      while (history.length > MAX_HISTORY_POINTS) {
        history.shift();
      }

      while (history.length && timestamp - history[0].time > GAZE_HISTORY_MS) {
        history.shift();
      }

      const windowPoints: Array<{ x: number; y: number; time: number }> = [];
      for (let i = history.length - 1; i >= 0; i -= 1) {
        const sample = history[i];
        if (timestamp - sample.time > FIXATION_WINDOW_MS) {
          break;
        }
        windowPoints.push(sample);
      }

      windowPoints.reverse();

      const lastFiltered = smoothedPointRef.current;

      if (lastFiltered && timestamp - lastFiltered.time > GAZE_HISTORY_MS) {
        smoothedPointRef.current = { x: rawX, y: rawY, time: timestamp };
        return { x: rawX, y: rawY };
      }

      if (windowPoints.length >= MIN_FIXATION_SAMPLES) {
        const fixationDuration = windowPoints[windowPoints.length - 1].time - windowPoints[0].time;

        if (fixationDuration >= FIXATION_MIN_DURATION_MS) {
          let weightSum = 0;
          let weightedX = 0;
          let weightedY = 0;

          for (const sample of windowPoints) {
            const age = Math.max(0, timestamp - sample.time);
            const weight = Math.exp(-age / 120);
            weightSum += weight;
            weightedX += sample.x * weight;
            weightedY += sample.y * weight;
          }

          if (weightSum > 0) {
            const centroidX = weightedX / weightSum;
            const centroidY = weightedY / weightSum;

            let dispersionAccumulator = 0;
            for (const sample of windowPoints) {
              const dx = sample.x - centroidX;
              const dy = sample.y - centroidY;
              dispersionAccumulator += dx * dx + dy * dy;
            }

            const rmsDispersion = Math.sqrt(dispersionAccumulator / windowPoints.length);

            if (rmsDispersion <= FIXATION_MAX_RADIUS_PX) {
              const filteredFixationPoint = {
                x: centroidX,
                y: centroidY,
              };
              smoothedPointRef.current = { ...filteredFixationPoint, time: timestamp };
              return filteredFixationPoint;
            }
          }
        }
      }

      if (!lastFiltered) {
        smoothedPointRef.current = { x: rawX, y: rawY, time: timestamp };
        return { x: rawX, y: rawY };
      }

      const deltaX = rawX - lastFiltered.x;
      const deltaY = rawY - lastFiltered.y;
      const dt = Math.max(16, timestamp - lastFiltered.time);
      const distance = Math.hypot(deltaX, deltaY);
      const velocity = (distance / dt) * 1000;

      if (distance > FIXATION_MAX_RADIUS_PX * 4 && velocity > MAX_VELOCITY_PX_PER_S * 0.6) {
        smoothedPointRef.current = { x: rawX, y: rawY, time: timestamp };
        return { x: rawX, y: rawY };
      }

      const normalizedVelocity = clamp(velocity, 0, MAX_VELOCITY_PX_PER_S) / MAX_VELOCITY_PX_PER_S;
      const alpha = clamp(
        SMOOTH_MIN_ALPHA + (SMOOTH_MAX_ALPHA - SMOOTH_MIN_ALPHA) * normalizedVelocity,
        SMOOTH_MIN_ALPHA,
        SMOOTH_MAX_ALPHA
      );

      const filteredX = lastFiltered.x + alpha * deltaX;
      const filteredY = lastFiltered.y + alpha * deltaY;

      const safeX = Number.isFinite(filteredX) ? filteredX : rawX;
      const safeY = Number.isFinite(filteredY) ? filteredY : rawY;

      smoothedPointRef.current = { x: safeX, y: safeY, time: timestamp };

      return { x: safeX, y: safeY };
    }, []);

  const handleGazeData = useCallback((prediction: any, elapsedTime: number) => {
    if (isManuallyStoppedRef.current || !prediction) {
      return;
    }

    if (!Number.isFinite(prediction.x) || !Number.isFinite(prediction.y)) {
      return;
    }

    const timestamp = Date.now();
    const filteredPoint = computeFilteredGazePoint(prediction.x, prediction.y, timestamp);

    // Convert WebGazer prediction to GazeData format for compatibility using the filtered gaze point
    const gazeData: GazeData = {
      state: 0, // Valid gaze data
      docX: filteredPoint.x,
      docY: filteredPoint.y,
      time: timestamp - elapsedTime, // Use WebGazer's elapsed time for consistency
      GazeX: filteredPoint.x,
      GazeY: filteredPoint.y,
      HeadX: 0, // WebGazer doesn't provide head position data
      HeadY: 0,
      HeadZ: 0,
      HeadYaw: 0,
      HeadPitch: 0,
      HeadRoll: 0,
    };
    setGazeData(gazeData);

    const now = Date.now();
    lastResultRef.current = now;

    setStatus((prev) => {
      if (prev === 'denied' || prev === 'error' || prev === 'inactive') {
        return prev;
      }
      return 'active';
    });
  }, [computeFilteredGazePoint]);


  const handleCalibrationComplete = useCallback(() => {
    console.log('Calibration complete');
    resetSmoothingState();
    hasCalibratedRef.current = true;
    const now = Date.now();
    lastResultRef.current = now;
    setStatus('active');
  }, [resetSmoothingState]);

  const handleCameraDenied = useCallback(() => {
    console.error('Camera access denied');
    setStatus('denied');
    setError('Camera access was denied. Please allow camera access to use this feature.');
    isManuallyStoppedRef.current = true;
    restartingRef.current = false;
    lastResultRef.current = null;
    clearRestartTimer();
    clearHealthInterval();
    resetSmoothingState();
    setGazeData(null);
    if (window.webgazer) {
      try {
        window.webgazer.clearGazeListener().end();
      } catch (error) {
        console.warn('Error stopping WebGazer after camera denied:', error);
      }
    }
  }, [clearHealthInterval, clearRestartTimer, resetSmoothingState]);

  const handleError = useCallback((msg: string) => {
    console.error(`Eye tracking error: ${msg}`);
    setStatus('error');
    setError(msg);
    restartingRef.current = false;
    isManuallyStoppedRef.current = true;
    lastResultRef.current = null;
    clearRestartTimer();
    clearHealthInterval();
    resetSmoothingState();
  }, [clearHealthInterval, clearRestartTimer, resetSmoothingState]);

  const attachListeners = useCallback(() => {
    if (!window.webgazer) {
      return false;
    }

    // Set up WebGazer parameters
    window.webgazer.params.showVideo = false;
    window.webgazer.params.showGazeDot = false;
    window.webgazer.params.showFaceOverlay = false;
    window.webgazer.params.showFaceFeedbackBox = false;

    // Set WebGazer gaze listener
    window.webgazer.setGazeListener(handleGazeData);

    return true;
  }, [handleGazeData]);

  useEffect(() => {
    return () => {
      clearRestartTimer();
      clearHealthInterval();
      resetSmoothingState();
      if (window.webgazer) {
        try {
          window.webgazer.clearGazeListener();
          // Give WebGazer a moment to clean up before ending
          setTimeout(() => {
            try {
              window.webgazer.end();
            } catch (error) {
              console.warn('Error ending WebGazer:', error);
            }
          }, 100);
        } catch (error) {
          console.warn('Error cleaning up WebGazer:', error);
        }
      }
    };
  }, [clearHealthInterval, clearRestartTimer, resetSmoothingState]);

  const startTracking = useCallback(() => {
    if (!window.webgazer) {
      setError('WebGazer not loaded. Please check your internet connection.');
      return;
    }

    isManuallyStoppedRef.current = false;
    restartingRef.current = false;
    setError(null);
    resetSmoothingState();

    if (!attachListeners()) {
      setError('Unable to initialize gaze tracking listeners.');
      return;
    }

    clearRestartTimer();
    const now = Date.now();
    lastResultRef.current = now;

    if (hasCalibratedRef.current) {
      setStatus('reconnecting');
    } else {
      setStatus('calibrating');
      setShowCalibration(true);
    }

    try {
      // Configure webgazer and start tracking
      // Disable saving data across sessions for privacy
      window.saveDataAcrossSessions = false;
      
      window.webgazer
        .setTracker('TFFacemesh')
        .setRegression('ridge')
        .begin()
        .then(() => {
          // WebGazer has started successfully
          if (hasCalibratedRef.current) {
            // Already calibrated, start tracking immediately
            setStatus('active');
          }
          // If not calibrated, the UI will handle the calibration process
        })
        .catch((error: any) => {
          console.error('WebGazer failed to start:', error);
          if (error.name === 'NotAllowedError') {
            handleCameraDenied();
          } else {
            handleError('Failed to start eye tracking: ' + error.message);
          }
        });
    } catch (error: any) {
      console.error('Error configuring WebGazer:', error);
      handleError('Failed to configure eye tracking: ' + error.message);
    }
  }, [attachListeners, clearRestartTimer, handleCalibrationComplete, handleCameraDenied, handleError, resetSmoothingState]);

  const restartTracking = useCallback(() => {
    if (!window.webgazer || isManuallyStoppedRef.current) {
      return;
    }

    if (!attachListeners()) {
      return;
    }

    if (restartingRef.current) {
      return;
    }

    restartingRef.current = true;
    setStatus('reconnecting');
    const now = Date.now();
    lastResultRef.current = now;

    try {
      window.webgazer.pause();
    } catch (stopError) {
      console.warn('Failed to pause tracking before restart', stopError);
    }

    clearRestartTimer();
    restartTimerRef.current = window.setTimeout(() => {
      try {
        if (window.webgazer) {
          window.webgazer.resume();
        }
      } catch (error) {
        console.warn('Failed to resume tracking after restart', error);
      } finally {
        restartingRef.current = false;
        restartTimerRef.current = null;
      }
    }, RESTART_DELAY);
  }, [attachListeners, clearRestartTimer]);

  const stopTracking = useCallback(() => {
    if (window.webgazer) {
      try {
        window.webgazer.clearGazeListener().end();
      } catch (error) {
        console.warn('Error stopping WebGazer:', error);
      }
    }
    setStatus('inactive');
    isManuallyStoppedRef.current = true;
    restartingRef.current = false;
    lastResultRef.current = null;
    setGazeData(null);
    clearRestartTimer();
    clearHealthInterval();
    resetSmoothingState();
  }, [clearHealthInterval, clearRestartTimer, resetSmoothingState]);

  useEffect(() => {
    clearHealthInterval();

    if (isManuallyStoppedRef.current) {
      return;
    }

    if (!hasCalibratedRef.current) {
      return;
    }

    if (status === 'inactive' || status === 'denied' || status === 'error') {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (isManuallyStoppedRef.current) {
        return;
      }

      const lastResult = lastResultRef.current;
      if (!lastResult) {
        return;
      }

      if (Date.now() - lastResult > AUTO_RESTART_THRESHOLD) {
        restartTracking();
      }
    }, HEALTH_CHECK_INTERVAL);

    healthIntervalRef.current = intervalId;

    return () => {
      window.clearInterval(intervalId);
      if (healthIntervalRef.current === intervalId) {
        healthIntervalRef.current = null;
      }
    };
  }, [clearHealthInterval, restartTracking, status]);

  // Handle calibration completion
  const handleCalibrationDone = useCallback(() => {
    hasCalibratedRef.current = true;
    setShowCalibration(false);
    handleCalibrationComplete();
  }, [handleCalibrationComplete]);

  // Calibration overlay element returned when needed (memoized to avoid remount loops)
  const calibrationOverlay = useMemo(() => {
    if (!showCalibration) {
      return null;
    }
    return React.createElement(CalibrationOverlay, {
      onComplete: handleCalibrationDone
    });
  }, [showCalibration, handleCalibrationDone]);

  return {
    gazeData,
    status,
    startTracking,
    stopTracking,
    error,
    calibrationOverlay
  };
};