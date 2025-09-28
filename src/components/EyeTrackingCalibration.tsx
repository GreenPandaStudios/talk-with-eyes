
import React, { useState, useEffect, useRef } from 'react';

interface CalibrationPoint {
  x: number;
  y: number;
}

export const EyeTrackingCalibration: React.FC<{ handleDone: () => void }> = ({ handleDone }) => {
  const calibrationPoints: CalibrationPoint[] = [
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

  const [currentPointIndex, setCurrentPointIndex] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [isActive] = useState(true);
  const intervalRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);

  const currentPoint = calibrationPoints[currentPointIndex];
  const isComplete = currentPointIndex >= calibrationPoints.length;

  // Handle countdown and point progression
  useEffect(() => {
    if (isComplete) {
      // Add calibration data to WebGazer before completing
      if (window.webgazer) {
        // Force WebGazer to use the calibration data
        try {
          // Add some artificial calibration points to improve accuracy
          calibrationPoints.forEach((point, index) => {
            const screenX = point.x * window.innerWidth;
            const screenY = point.y * window.innerHeight;
            // Use WebGazer's internal calibration if available
            if (window.webgazer.recordScreenPosition) {
              window.webgazer.recordScreenPosition(screenX, screenY, 'click');
            }
          });
        } catch (error) {
          console.warn('Could not add calibration data to WebGazer:', error);
        }
      }
      handleDone();
      return;
    }   
    if (!isActive || isComplete) return;

    countdownRef.current = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          // Record current calibration point with WebGazer
          if (window.webgazer && currentPoint) {
            try {
              const screenX = currentPoint.x * window.innerWidth;
              const screenY = currentPoint.y * window.innerHeight;
              if (window.webgazer.recordScreenPosition) {
                window.webgazer.recordScreenPosition(screenX, screenY, 'click');
              }
            } catch (error) {
              console.warn('Could not record calibration point:', error);
            }
          }
          // Move to next point
          setCurrentPointIndex((prevIndex) => prevIndex + 1);
          return 3; // Reset countdown
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) {
        window.clearInterval(countdownRef.current);
      }
    };
  }, [currentPointIndex, isActive, isComplete, currentPoint, handleDone]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      if (countdownRef.current) window.clearInterval(countdownRef.current);
    };
  }, []);

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

  const pointStyle: React.CSSProperties = {
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
  };

  const progressStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: '2rem',
    left: '50%',
    transform: 'translateX(-50%)',
    fontSize: '1rem',
    color: '#ccc',
  };

  if (isComplete) {
    return (
      <div style={calibrationStyle}>
        <div style={instructionStyle}>
          <h2>Calibration Complete!</h2>
          <p>Eye tracking is now ready. The app will continue in a moment...</p>
        </div>
      </div>
    );
  }

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
        Point {currentPointIndex + 1} of {calibrationPoints.length}
      </div>
    </div>
  );
};
