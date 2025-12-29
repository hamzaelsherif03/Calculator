import { useRef, useCallback } from 'react';

type SoundType = 'cash' | 'alert' | 'warning';

export function useAudioAlerts() {
    const audioContext = useRef<AudioContext | null>(null);

    const initAudio = useCallback(() => {
        if (!audioContext.current) {
            audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (audioContext.current.state === 'suspended') {
            audioContext.current.resume();
        }
    }, []);

    const playSound = useCallback((type: SoundType) => {
        initAudio();
        const ctx = audioContext.current;
        if (!ctx) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        const now = ctx.currentTime;

        if (type === 'cash') {
            // "Ka-ching" effect: two increasing tones
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);

            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.3, now + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

            osc.start(now);
            osc.stop(now + 0.5);

            // Second Coin
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.connect(gain2);
            gain2.connect(ctx.destination);

            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(1200, now + 0.1);
            osc2.frequency.exponentialRampToValueAtTime(2000, now + 0.2);

            gain2.gain.setValueAtTime(0, now + 0.1);
            gain2.gain.linearRampToValueAtTime(0.3, now + 0.15);
            gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.6);

            osc2.start(now + 0.1);
            osc2.stop(now + 0.6);

        } else if (type === 'alert') {
            // Gentle reminder: Soft sine pulse
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, now);

            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.2, now + 0.2);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 1.0);

            osc.start(now);
            osc.stop(now + 1.0);
        } else if (type === 'warning') {
            // Danger: Lower pitched pulses
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.linearRampToValueAtTime(100, now + 0.3);

            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.3, now + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

            osc.start(now);
            osc.stop(now + 0.5);
        }
    }, [initAudio]);

    return { playSound };
}
