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
const GAZE_HISTORY_MS = 2000;       // Increased history window for more data points
const MAX_HISTORY_POINTS = 200;     // Increased max points to accommodate larger window
const FIXATION_WINDOW_MS = 800;     // Longer window for fixation detection
const FIXATION_MIN_DURATION_MS = 250;  // Reduced to detect fixations earlier
const FIXATION_MAX_RADIUS_PX = 45;  // Slightly larger radius for fixation detection
const MIN_FIXATION_SAMPLES = 8;     // More samples required for a fixation
const SMOOTH_MIN_ALPHA = 0.08;      // Much lower alpha for slower transitions when stationary
const SMOOTH_MAX_ALPHA = 0.6;       // Lower max alpha for smoother motion during saccades
const MAX_VELOCITY_PX_PER_S = 1500; // Lower velocity threshold
const OUTLIER_THRESHOLD_PX = 120;   // Distance threshold for outlier detection

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
      
      // Detect and filter obvious outliers before adding to history
      if (history.length > 0) {
        const lastPoint = history[history.length - 1];
        const distance = Math.hypot(rawX - lastPoint.x, rawY - lastPoint.y);
        
        // Skip extreme jumps that are likely tracking errors
        if (distance > OUTLIER_THRESHOLD_PX) {
          // Return last smoothed point if available or last raw point as fallback
          return smoothedPointRef.current || lastPoint;
        }
      }
      
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
          // Calculate time-weighted centroid with stronger recency bias
          let weightSum = 0;
          let weightedX = 0;
          let weightedY = 0;

          for (const sample of windowPoints) {
            // Exponential weighting with stronger recency bias (80ms decay)
            const age = Math.max(0, timestamp - sample.time);
            const weight = Math.exp(-age / 80);
            weightSum += weight;
            weightedX += sample.x * weight;
            weightedY += sample.y * weight;
          }

          if (weightSum > 0) {
            const centroidX = weightedX / weightSum;
            const centroidY = weightedY / weightSum;

            // Calculate dispersion to detect fixation (standard deviation of points)
            let dispersionAccumulator = 0;
            for (const sample of windowPoints) {
              const dx = sample.x - centroidX;
              const dy = sample.y - centroidY;
              dispersionAccumulator += dx * dx + dy * dy;
            }

            const rmsDispersion = Math.sqrt(dispersionAccumulator / windowPoints.length);

            // If a fixation is detected
            if (rmsDispersion <= FIXATION_MAX_RADIUS_PX) {
              // Temporal stabilization - blend with previous fixation if it exists
              const filteredFixationPoint = { x: centroidX, y: centroidY };
              
              // If we already had a previous fixation point, blend them for stability
              if (smoothedPointRef.current) {
                // Use very slow transition (strong stability) during fixations
                const stabilityFactor = 0.15; 
                filteredFixationPoint.x = smoothedPointRef.current.x + 
                  stabilityFactor * (centroidX - smoothedPointRef.current.x);
                filteredFixationPoint.y = smoothedPointRef.current.y + 
                  stabilityFactor * (centroidY - smoothedPointRef.current.y);
              }
              
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

      // Only reset on extreme saccades to avoid unnecessary jumps
      if (distance > FIXATION_MAX_RADIUS_PX * 6 && velocity > MAX_VELOCITY_PX_PER_S * 0.8) {
        smoothedPointRef.current = { x: rawX, y: rawY, time: timestamp };
        return { x: rawX, y: rawY };
      }
      
      // Calculate adaptive smoothing factor based on velocity and distance
      // Lower velocity = stronger smoothing (lower alpha)
      const normalizedVelocity = Math.pow(clamp(velocity, 0, MAX_VELOCITY_PX_PER_S) / MAX_VELOCITY_PX_PER_S, 1.5);
      
      // Stronger smoothing (lower alpha) for small movements
      const distanceFactor = clamp(distance / 100, 0, 1);
      
      // Final adaptive alpha calculation with stronger smoothing for slower/smaller movements
      const alpha = clamp(
        SMOOTH_MIN_ALPHA + (SMOOTH_MAX_ALPHA - SMOOTH_MIN_ALPHA) * (0.3 * normalizedVelocity + 0.7 * distanceFactor),
        SMOOTH_MIN_ALPHA,
        SMOOTH_MAX_ALPHA
      );

      const filteredX = lastFiltered.x + alpha * deltaX;
      const filteredY = lastFiltered.y + alpha * deltaY;

      let safeX = Number.isFinite(filteredX) ? filteredX : rawX;
      let safeY = Number.isFinite(filteredY) ? filteredY : rawY;
      
      // Apply additional moving-average filter for fast movements
      if (velocity > MAX_VELOCITY_PX_PER_S * 0.3) {
        // Get recent points for a moving average during saccades
        const recentPoints = history.slice(-5);
        if (recentPoints.length >= 3) {
          // Simple moving average for additional stability during fast movements
          let avgX = safeX; // Start with our filtered point
          let avgY = safeY;
          let count = 1;
          
          // Add recent points with decreasing weights
          for (let i = recentPoints.length - 2; i >= Math.max(0, recentPoints.length - 4); i--) {
            const pt = recentPoints[i];
            const weight = 0.5 / (recentPoints.length - i); // Decreasing weight by recency
            avgX += pt.x * weight;
            avgY += pt.y * weight;
            count += weight;
          }
          
          if (count > 0) {
            // Final weighted average
            safeX = avgX / count;
            safeY = avgY / count;
          }
        }
      }

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