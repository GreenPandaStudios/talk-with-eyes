import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './PhoneticWheel.module.css';
import type { IAlphabet, languages } from '../types';

type SelectionLevel = 'group' | 'letter';

type RelativePoint = {
  x: number;
  y: number;
};

interface PhoneticWheelProps {
  gazeX: number;
  gazeY: number;
  language: languages;
  isTracking: boolean;
  onSelection: (sound: string) => void;
  onSubmit: () => void;
}

const CENTER_INDEX = 8;
const SOUTH_INDEX = 4;
const LETTER_ZONE_ORDER = [7, 0, 1, 2, 3, 5, 6]; // Tiles used for letters during step 2
const DWELL_TIME = 1500; // milliseconds required to activate a tile
const COOLDOWN_TIME = 1000; // pause after an action to prevent double-activation
const SNAP_DISTANCE_RATIO = 1.1; // how far (in radii) we snap to nearest tile
const EXIT_DISTANCE_RATIO = 1.35; // how far we allow before disengaging

const ZONE_NAMES = [
  'North',
  'Northeast',
  'East',
  'Southeast',
  'South',
  'Southwest',
  'West',
  'Northwest',
  'Center',
] as const;

const ZONE_TO_GRID_AREA: Record<number, string> = {
  0: 'n',
  1: 'ne',
  2: 'e',
  3: 'se',
  4: 's',
  5: 'sw',
  6: 'w',
  7: 'nw',
  8: 'center',
};

const ALPHABETS: Record<languages, IAlphabet> = {
  english: {
    zones: [
      {
        label: 'A • B • C • D • 9',
        letters: ['A', 'B', 'C', 'D', '9'],
        hint: 'Common starters',
      },
      {
        label: 'E • F • G • H • 8',
        letters: ['E', 'F', 'G', 'H', '8'],
        hint: 'High-frequency consonants',
      },
      {
        label: 'I • J • K • L • 7',
        letters: ['I', 'J', 'K', 'L', '7'],
        hint: 'Right-hand letters',
      },
      {
        label: 'M • N • O • P • 6',
        letters: ['M', 'N', 'O', 'P', '6'],
        hint: 'Mid-word sounds',
      },
      {
        label: 'Delete',
        letters: [],
        hint: 'Remove the last letter',
      },
      {
        label: 'Q • R • S • T • 5 • 4',
        letters: ['Q', 'R', 'S', 'T', '5', '4'],
        hint: 'Common endings',
      },
      {
        label: 'U • V • W • 0 • 1 • 2 • 3',
        letters: ['U', 'V', 'W', '0', '1', '2', '3'],
        hint: 'Vowel sounds & numbers',
      },
      {
        label: 'X • Y • Z • . • ? • !',
        letters: ['X', 'Y', 'Z', '.', '?', '!'],
        hint: 'Punctuation & rare letters',
      },
    ],
    specialActions: {
      space: 'Space',
      delete: 'Delete',
      submit: 'Submit',
    },
    backLabel: 'Back',
  },
  spanish: {
    zones: [
      {
        label: 'A • B • C • CH • 9',
        letters: ['A', 'B', 'C', 'CH', '9'],
        hint: 'Inicio frecuente',
      },
      {
        label: 'D • E • F • G • 8 • 3',
        letters: ['D', 'E', 'F', 'G', '8', '3'],
        hint: 'Consonantes comunes',
      },
      {
        label: 'H • I • J • K • 7',
        letters: ['H', 'I', 'J', 'K', '7'],
        hint: 'Sonidos suaves',
      },
      {
        label: 'L • LL • M • N • Ñ • 6',
        letters: ['L', 'LL', 'M', 'N', 'Ñ', '6'],
        hint: 'Letras dobles',
      },
      {
        label: 'Borrar',
        letters: [],
        hint: 'Eliminar la última letra',
      },
      {
        label: 'O • P • Q • R • RR • 5 • 4',
        letters: ['O', 'P', 'Q', 'R', 'RR', '5', '4'],
        hint: 'Sílabas comunes',
      },
      {
        label: 'S • T • U • V • 0 • 1 • 2',
        letters: ['S', 'T', 'U', 'V', '0', '1', '2'],
        hint: 'Finales frecuentes',
      },
      {
        label: 'W • X • Y • Z • . • ? • !',
        letters: ['W', 'X', 'Y', 'Z', '.', '?', '!'],
        hint: 'Puntuación y letras raras',
      },
    ],
    specialActions: {
      space: 'Espacio',
      delete: 'Borrar',
      submit: 'Enviar',
    },
    backLabel: 'Atrás',
  },
};

export const PhoneticWheel: React.FC<PhoneticWheelProps> = ({
  gazeX,
  gazeY,
  language,
  isTracking,
  onSelection,
  onSubmit,
}) => {
  const [selectionLevel, setSelectionLevel] = useState<SelectionLevel>('group');
  const [hoveredZone, setHoveredZone] = useState<number | null>(null);
  const [selectedZone, setSelectedZone] = useState<number | null>(null);
  const [dwellStartTime, setDwellStartTime] = useState<number | null>(null);
  const [dwellProgress, setDwellProgress] = useState(0);
  const [relativeGaze, setRelativeGaze] = useState<RelativePoint | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const zoneRefs = useRef<(HTMLDivElement | null)[]>([]);

  const alphabet = ALPHABETS[language];

  const activeLetters = useMemo(() => {
    if (selectedZone === null) {
      return [];
    }
    const zone = alphabet.zones[selectedZone];
    return zone?.letters ?? [];
  }, [alphabet, selectedZone]);

  const letterAssignments = useMemo(() => {
    const mapping = new Map<number, string>();
    activeLetters.slice(0, LETTER_ZONE_ORDER.length).forEach((letter, index) => {
      const zoneIndex = LETTER_ZONE_ORDER[index];
      mapping.set(zoneIndex, letter);
    });
    return mapping;
  }, [activeLetters]);

  const resetSelection = useCallback(() => {
    setSelectionLevel('group');
    setSelectedZone(null);
  }, []);

  const isZoneInteractive = useCallback(
    (index: number) => {
      if (index === CENTER_INDEX || index === SOUTH_INDEX) {
        return true;
      }

      if (selectionLevel === 'group') {
        const zone = alphabet.zones[index];
        return Boolean(zone && zone.letters.length > 0);
      }

      return letterAssignments.has(index);
    },
    [alphabet, letterAssignments, selectionLevel],
  );

  const handleZoneActivation = useCallback((zoneIndex: number | null) => {
    if (zoneIndex === null) {
      return;
    }

    const commit = () => {
      const now = Date.now();
      setCooldownUntil(now + COOLDOWN_TIME);
      setHoveredZone(null);
      setDwellStartTime(null);
      setDwellProgress(0);
      setRelativeGaze(null);
    };

    if (selectionLevel === 'group') {
      if (zoneIndex === CENTER_INDEX) {
        onSubmit();
        resetSelection();
        commit();
        return;
      }

      if (zoneIndex === SOUTH_INDEX) {
        onSelection('DELETE');
        commit();
        return;
      }

      const zone = alphabet.zones[zoneIndex];
      if (zone && zone.letters.length > 0) {
        setSelectedZone(zoneIndex);
        setSelectionLevel('letter');
        commit();
      }
      return;
    }

    if (zoneIndex === CENTER_INDEX) {
      onSelection(' ');
      resetSelection();
      commit();
      return;
    }

    if (zoneIndex === SOUTH_INDEX) {
      resetSelection();
      commit();
      return;
    }

    const letter = letterAssignments.get(zoneIndex);
    if (letter) {
      onSelection(letter);
      resetSelection();
      commit();
    }
  }, [alphabet, letterAssignments, onSelection, onSubmit, resetSelection, selectionLevel]);

  useEffect(() => {
    if (!isTracking || !containerRef.current) {
      setHoveredZone(null);
      setRelativeGaze(null);
      setDwellStartTime(null);
      setDwellProgress(0);
      return;
    }

    if (Date.now() < cooldownUntil) {
      setHoveredZone(null);
      setRelativeGaze(null);
      setDwellStartTime(null);
      setDwellProgress(0);
      return;
    }

    const containerRect = containerRef.current.getBoundingClientRect();
    const relX = gazeX - containerRect.left;
    const relY = gazeY - containerRect.top;

    if (relX < 0 || relY < 0 || relX > containerRect.width || relY > containerRect.height) {
      setHoveredZone(null);
      setRelativeGaze(null);
      setDwellStartTime(null);
      setDwellProgress(0);
      return;
    }

    setRelativeGaze({ x: relX, y: relY });

    const interactiveIndices = ZONE_NAMES.map((_, index) => index).filter(isZoneInteractive);

    let candidateZone: number | null = null;
    let candidateDistance = Number.POSITIVE_INFINITY;
    let candidateIsInside = false;

    interactiveIndices.forEach((index) => {
      const zoneEl = zoneRefs.current[index];
      if (!zoneEl) {
        return;
      }

      const zoneRect = zoneEl.getBoundingClientRect();
      const inside = gazeX >= zoneRect.left && gazeX <= zoneRect.right && gazeY >= zoneRect.top && gazeY <= zoneRect.bottom;
      const centerX = zoneRect.left + zoneRect.width / 2;
      const centerY = zoneRect.top + zoneRect.height / 2;
      const distance = Math.hypot(gazeX - centerX, gazeY - centerY);
      const radius = Math.min(zoneRect.width, zoneRect.height) / 2;
      const normalizedDistance = radius > 0 ? distance / radius : Number.POSITIVE_INFINITY;

      if (inside) {
        if (!candidateIsInside || normalizedDistance < candidateDistance) {
          candidateZone = index;
          candidateDistance = normalizedDistance;
          candidateIsInside = true;
        }
        return;
      }

      if (candidateIsInside) {
        return;
      }

      if (normalizedDistance < candidateDistance) {
        candidateZone = index;
        candidateDistance = normalizedDistance;
      }
    });

    if (candidateZone !== null) {
      const tolerance = candidateZone === hoveredZone ? EXIT_DISTANCE_RATIO : SNAP_DISTANCE_RATIO;
      if (!candidateIsInside && candidateDistance > tolerance) {
        candidateZone = null;
      }
    }

    if (candidateZone !== null) {
      if (candidateZone !== hoveredZone) {
        setHoveredZone(candidateZone);
        setDwellStartTime(Date.now());
        setDwellProgress(0);
      } else if (dwellStartTime === null) {
        setDwellStartTime(Date.now());
      }
      return;
    }

    if (hoveredZone !== null) {
      setHoveredZone(null);
    }
    setDwellStartTime(null);
    setDwellProgress(0);
  }, [cooldownUntil, gazeX, gazeY, hoveredZone, isTracking, isZoneInteractive, dwellStartTime]);

  useEffect(() => {
    if (hoveredZone === null || dwellStartTime === null) {
      setDwellProgress(0);
      return;
    }

    const tick = () => {
      if (Date.now() < cooldownUntil) {
        setDwellProgress(0);
        return;
      }

      const elapsed = Date.now() - dwellStartTime;
      if (elapsed >= DWELL_TIME) {
        handleZoneActivation(hoveredZone);
        return;
      }

      setDwellProgress(Math.min(1, elapsed / DWELL_TIME));
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [cooldownUntil, dwellStartTime, handleZoneActivation, hoveredZone]);

  useEffect(() => () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
  }, []);

  const renderCellContent = (index: number) => {
    if (selectionLevel === 'group') {
      if (index === CENTER_INDEX) {
        return {
          title: alphabet.specialActions.submit,
          detail: 'Send the current phrase',
        };
      }

      if (index === SOUTH_INDEX) {
        return {
          title: alphabet.specialActions.delete,
          detail: 'Remove the last character',
        };
      }

      const zone = alphabet.zones[index];
      if (!zone) {
        return { title: '', detail: '' };
      }

      return {
        title: zone.label,
        detail: zone.hint ?? '',
      };
    }

    if (index === CENTER_INDEX) {
      return {
        title: alphabet.specialActions.space,
        detail: 'Insert a space',
      };
    }

    if (index === SOUTH_INDEX) {
      return {
        title: alphabet.backLabel,
        detail: 'Return to the letter groups',
      };
    }

    const letter = letterAssignments.get(index);
    if (letter) {
      return {
        title: letter,
        detail: 'Add this sound',
      };
    }

    return { title: '', detail: '' };
  };

  return (
    <div className={styles.container}>

      <div className={styles.gridWrapper}>
        <div className={styles.grid} ref={containerRef}>
          {ZONE_NAMES.map((_, index) => {
            const { title, detail } = renderCellContent(index);
            const isHovered = hoveredZone === index;
            const isActiveGroup = selectionLevel === 'letter' && selectedZone === index;
            const area = ZONE_TO_GRID_AREA[index];
            const isInteractive = isZoneInteractive(index);

            const classNames = [
              styles.cell,
              isInteractive ? styles.cellClickable : '',
              isHovered ? styles.cellHovered : '',
              isActiveGroup ? styles.cellActive : '',
            ]
              .filter(Boolean)
              .join(' ');

            const handleClick = () => {
              if (isInteractive) {
                handleZoneActivation(index);
              }
            };

            const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
              if (!isInteractive) {
                return;
              }

              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleZoneActivation(index);
              }
            };

            return (
              <div
                key={index}
                className={classNames}
                style={{ gridArea: area }}
                aria-label={`${ZONE_NAMES[index]} zone: ${title}`}
                role={isInteractive ? 'button' : undefined}
                tabIndex={isInteractive ? 0 : -1}
                aria-disabled={!isInteractive}
                onClick={handleClick}
                onKeyDown={handleKeyDown}
                ref={(node) => {
                  zoneRefs.current[index] = node;
                }}
              >
                <span className={styles.cellTitle}>{title}</span>
                {detail && <span className={styles.cellDetail}>{detail}</span>}
                {isHovered && dwellProgress > 0 && (
                  <div className={styles.cellProgress}>
                    <div
                      className={styles.cellProgressFill}
                      style={{ width: `${Math.round(dwellProgress * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}

          {isTracking && relativeGaze && (
            <div
              className={styles.gazeCursor}
              style={{ left: relativeGaze.x, top: relativeGaze.y }}
            />
          )}
        </div>
      </div>
    </div>
  );
};