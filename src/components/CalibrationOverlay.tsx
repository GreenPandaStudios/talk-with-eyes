import React, { useState, useEffect, useRef } from 'react';

interface CalibrationPoint {
  x: number;
  y: number;
}

interface CalibrationOverlayProps {
  onComplete: () => void;
}

const CALIBRATION_POINTS: CalibrationPoint[] = [
    { x: 0.1, y: 0.1 },   // Top-left
    { x: 0.5, y: 0.1 },   // Top-center
    { x: 0.9, y: 0.1 },   // Top-right
    { x: 0.1, y: 0.5 },   // Middle-left
    { x: 0.5, y: 0.5 },   // Center
    { x: 0.9, y: 0.5 },   // Middle-right
    { x: 0.1, y: 0.9 },   // Bottom-left
    { x: 0.5, y: 0.9 },   // Bottom-center
    { x: 0.9, y: 0.9 },   // Bottom-right
    { x: 0.5, y: 0.5 },   // Center again 
    {x: 0.3, y: 0.3}, // Extra point
    {x: 0.7, y: 0.3},
    {x: 0.3, y: 0.7},
    {x: 0.7, y: 0.7},
    { x: 0.2, y: 0.2 }, // Extra points for better calibration
    { x: 0.8, y: 0.2 },
    { x: 0.2, y: 0.8 },
    { x: 0.8, y: 0.8 },
];

export const CalibrationOverlay: React.FC<CalibrationOverlayProps> = ({ onComplete }) => {
  const calibrationPoints = CALIBRATION_POINTS;

  const [currentPointIndex, setCurrentPointIndex] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const hasCompletedRef = useRef(false);

  const currentPoint = calibrationPoints[currentPointIndex];
  const isComplete = currentPointIndex >= calibrationPoints.length;

  // Debug logging
  console.log('CalibrationOverlay render:', { currentPointIndex, countdown, isComplete });

  // Handle completion
  useEffect(() => {
    if (!isComplete || hasCompletedRef.current) {
      return;
    }
    console.log('Calibration complete, cleaning up...');

    // Add calibration data to WebGazer
    if (window.webgazer) {
      try {
        calibrationPoints.forEach((point) => {
          const screenX = point.x * window.innerWidth;
          const screenY = point.y * window.innerHeight;
          // Use WebGazer's click method to add calibration data
          window.webgazer.recordScreenPosition?.(screenX, screenY, 'click');
        });
      } catch (error) {
        console.warn('Could not add calibration data:', error);
      }
    }

    hasCompletedRef.current = true;
    onComplete();
  }, [calibrationPoints, isComplete, onComplete]);

  // Handle countdown and point progression
  useEffect(() => {
    if (isComplete || hasCompletedRef.current) {
      return;
    }

    if (countdown === 0) {
      console.log('Point complete, moving to next...');

      if (window.webgazer && currentPoint) {
        try {
          const screenX = currentPoint.x * window.innerWidth;
          const screenY = currentPoint.y * window.innerHeight;
          console.log('Recording calibration point:', screenX, screenY);
          window.webgazer.recordScreenPosition?.(screenX, screenY, 'click');
        } catch (error) {
          console.warn('Could not record calibration point:', error);
        }
      }

      setCurrentPointIndex((prevIndex) => prevIndex + 1);
      setCountdown(3);
      return;
    }

    const timer = window.setTimeout(() => {
      setCountdown((prev) => Math.max(prev - 1, 0));
    }, 1000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [countdown, currentPoint, isComplete]);

  const calibrationStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: '#000',
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    fontFamily: 'system-ui, -apple-system, sans-serif',
  };

  const instructionStyle: React.CSSProperties = {
    textAlign: 'center',
    marginBottom: '2rem',
    fontSize: '1.2rem',
    lineHeight: '1.5',
  };

  const pointStyle: React.CSSProperties | undefined = currentPoint
    ? {
        position: 'absolute',
        left: `${currentPoint.x * 100}%`,
        top: `${currentPoint.y * 100}%`,
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        backgroundColor: '#ff4444',
        transform: 'translate(-50%, -50%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '1.2rem',
        fontWeight: 'bold',
        color: '#fff',
        boxShadow: '0 0 20px rgba(255, 68, 68, 0.6)',
        animation: 'pulse 1s infinite',
      }
    : undefined;

  const progressStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: '2rem',
    left: '50%',
    transform: 'translateX(-50%)',
    fontSize: '1rem',
    color: '#ccc',
  };

  return (
    <div style={calibrationStyle}>
      <style>{`
        @keyframes pulse {
          0% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.1); }
          100% { transform: translate(-50%, -50%) scale(1); }
        }
      `}</style>
      
      <div style={instructionStyle}>
        <h2>Eye Tracking Calibration</h2>
        <p>Look directly at the red dot and keep your head still.</p>
        <p>The dot will move automatically to different positions.</p>
      </div>

      {currentPoint && (
        <div style={pointStyle}>
          {countdown}
        </div>
      )}

      <div style={progressStyle}>
        Point {Math.min(currentPointIndex + 1, calibrationPoints.length)} of {calibrationPoints.length}
      </div>
    </div>
  );
};