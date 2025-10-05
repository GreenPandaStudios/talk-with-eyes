import React, { useCallback, useMemo, useState } from 'react';
import { useEyeTracking } from '../hooks/useEyeTracking';
import { useOpenAI } from '../hooks/useOpenAI';
import { PhoneticWheel } from './PhoneticWheel';
import { getOpenAIApiKeyFromPassword } from '../utils';
import type { languages } from '../types';
import styles from './EyeTalkApp.module.css';

const EyeTalkApp: React.FC = () => {
  const [password, setPassword] = useState('');
  const [phoneticInput, setPhoneticInput] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [language, setLanguage] = useState<languages>('english');
  const [showApiInput, setShowApiInput] = useState(true);
  const [showSettingsOverlay, setShowSettingsOverlay] = useState(false);
  const [isLoadingText, setIsLoadingText] = useState(false);

  const { gazeData, status, startTracking, stopTracking, error: trackingError, calibrationOverlay } = useEyeTracking();
  const { processPhoneticInput, isProcessing, error: openaiError, setApiKey: setOpenAIKey } = useOpenAI();

  const handlePhoneticSelection = useCallback((sound: string) => {
    if (sound === 'DELETE') {
      setPhoneticInput((prev) => prev.slice(0, -1));
    } else {
      setPhoneticInput((prev) => prev + sound);
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!phoneticInput.trim()) return;
          setTranslatedText('');

    try {
      setIsLoadingText(true);
      const result = await processPhoneticInput(phoneticInput, language);
      // clear the input after submission
      setPhoneticInput('');
      setTranslatedText(result);
    } catch (error) {
      console.error('Error processing input:', error);
    } finally {
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Ensure loading state is visible
      setIsLoadingText(false);

    }
  }, [language, phoneticInput, processPhoneticInput, setIsLoadingText]);

  const handleApiKeySubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    var apiKey = await getOpenAIApiKeyFromPassword(password);
    setOpenAIKey(apiKey);
    setShowApiInput(false);
  }, [password]);

  const statusBadge = useMemo(() => {
    switch (status) {
      case 'active':
        return 'Tracking active';
      case 'calibrating':
        return 'Calibrating';
      case 'reconnecting':
        return 'Reconnecting';
      case 'denied':
        return 'Camera denied';
      case 'error':
        return 'Tracking error';
      default:
        return 'Tracking stopped';
    }
  }, [status]);



  const statusDescription = useMemo(() => {
    switch (status) {
      case 'active':
        return 'Move your gaze to choose tiles.';
      case 'calibrating':
        return 'Follow the calibration dots to begin.';
      case 'reconnecting':
        return 'Hold steady—we are automatically reconnecting.';
      case 'denied':
        return 'Allow camera access to continue.';
      case 'error':
        return 'Fix the error, then restart tracking.';
      default:
        return 'Press start to begin eye tracking.';
    }
  }, [status]);

  const gazeLabel = (() => {
    if (status === 'active' && gazeData) {
      return `${Math.round(gazeData.GazeX)}, ${Math.round(gazeData.GazeY)}`;
    }
    if (status === 'reconnecting') {
      return 'Reconnecting…';
    }
    return 'Waiting for gaze…';
  })();

  const combinedError = trackingError || openaiError;
  const isTrackingEngaged = status === 'active' || status === 'reconnecting';
  const isWheelActive = status === 'active';
  const fallbackGazeX = gazeData?.GazeX ?? 0;
  const fallbackGazeY = gazeData?.GazeY ?? 0;
  const helperCopy = useMemo(() => {
    if (status === 'calibrating') {
      return 'Keep your head steady and follow the calibration points.';
    }
    if (status === 'reconnecting') {
      return 'Hold still—tracking restarts automatically every few seconds.';
    }
    return null;
  }, [status]);

  // Show calibration overlay when the hook provides one
  if (calibrationOverlay) {
    return (
      <div className={styles.appShell}>
        {calibrationOverlay}
      </div>
    );
  }
  if (isLoadingText) {
    return (
      <div className={styles.appShell}>
        <div className={styles.loadingOverlay}>
          {!translatedText && (<div className={styles.loadingSpinner} aria-hidden="true"></div>)}
          <h1 className={styles.loadingText}>
            {translatedText ? translatedText : 'Processing your input...'}
          </h1>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.appShell}>

            <div className={styles.textDisplay} aria-live="polite">
              {phoneticInput ? phoneticInput : <span className={styles.placeholder}>Your letters will appear here.</span>}
            </div>
      <div className={styles.wheelStage}>
        {
        !isProcessing &&
        <PhoneticWheel
          gazeX={fallbackGazeX}
          gazeY={fallbackGazeY}
          isTracking={isWheelActive}
          language={language}
          onSelection={handlePhoneticSelection}
          onSubmit={handleSubmit}
        />
        }
      </div>

      {showApiInput ? (
        <div className={styles.apiOverlay}>
          <form onSubmit={handleApiKeySubmit} className={styles.apiForm}>
            <h2>Connect your OpenAI account</h2>
            <p className={styles.apiFormDescription}>
              Enter your password
            </p>
            <label htmlFor="apiKey" className={styles.apiFormLabel}>
              Password
            </label>
            <input
              type="password"
              id="apiKey"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder=""
              required
            />
            <button type="submit">Save and continue</button>
          </form>
        </div>
      ) : showSettingsOverlay ? ( 
        <>
          <div className={`${styles.edgePanel} ${styles.sessionPanel}`}>
            <div className={styles.panelHeader}>
              <h2>Session</h2>
              <span className={styles.cardSubtitle}>{statusDescription}</span>
            </div>

            <div className={styles.controlRow}>
              {isTrackingEngaged ? (
                <button onClick={stopTracking} className={styles.primaryButton}>
                  Stop tracking
                </button>
              ) : (
                <button onClick={startTracking} className={styles.primaryButton}>
                  Start tracking
                </button>
              )}

              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value as languages)}
                className={styles.languageSelect}
              >
                <option value="english">English</option>
                <option value="spanish">Español</option>
              </select>
            </div>
            {helperCopy && <p className={styles.helperText}>{helperCopy}</p>}

            <dl className={styles.metrics}>
              <div>
                <dt>Status</dt>
                <dd>{statusBadge}</dd>
              </div>
              <div>
                <dt>Gaze</dt>
                <dd>{gazeLabel}</dd>
              </div>
            </dl>

            {combinedError && <div className={styles.errorBanner}>{combinedError}</div>}
          </div>

          <div className={`${styles.edgePanel} ${styles.statusPanel}`}>
            <span className={`${styles.statusBadge} ${styles[`status-${status}`]}`}>
              {statusBadge}
            </span>
            <span className={styles.gazeIndicatorLabel}>Gaze</span>
            <span className={styles.gazeIndicatorValue}>{gazeLabel}</span>
          </div>

          <div className={`${styles.edgePanel} ${styles.builderPanel}`}>
            <div className={styles.panelHeader}>
              <h2>Letter builder</h2>
              <span className={styles.cardSubtitle}>Look at the wheel to add letters.</span>
            </div>


            <div className={styles.buttonStack}>
              <button onClick={handleSubmit} disabled={isProcessing || !phoneticInput.trim()}>
                Submit phrase
              </button>
              <button onClick={() => setPhoneticInput('')} disabled={!phoneticInput}>
                Clear input
              </button>
              <button onClick={() => setShowApiInput(true)}>Change API key</button>
            </div>
          </div>

          <div className={`${styles.edgePanel} ${styles.responsePanel}`}>
            <div className={styles.panelHeader}>
              <h2>AI response</h2>
              <span className={styles.cardSubtitle}>Your translated sentence.</span>
            </div>

            <div className={styles.textDisplay} aria-live="polite">
              {isProcessing ? (
                <span className={styles.placeholder}>Processing…</span>
              ) : translatedText ? (
                translatedText
              ) : (
                <span className={styles.placeholder}>The translation will appear here.</span>
              )}
            </div>
          </div>
          <button className={styles.closeButton} onClick={() => setShowSettingsOverlay(false)} aria-label="Close settings panel">
            Close Settings
          </button>
        </>
      ) : (
        <button className={styles.settingsButton} onClick={() => setShowSettingsOverlay(true)}>Open Settings</button>
      )}
    </div>
  );
};

export default EyeTalkApp;