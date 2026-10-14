import { useEffect, useRef, useState } from 'react';

type FocusCapabilities = MediaTrackCapabilities & { focusMode?: string[] };

/** Keep one session through review, but release hardware on exit/background/lens change. */
export function useStickerCamera(active: boolean) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState('');
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [deviceId, setDeviceId] = useState('');
    const [generation, setGeneration] = useState(0);
    const [visible, setVisible] = useState(document.visibilityState !== 'hidden');

    useEffect(() => {
        const visibility = () => setVisible(document.visibilityState !== 'hidden');
        const hide = () => setVisible(false);
        const show = () => { visibility(); setGeneration(value => value + 1); };
        document.addEventListener('visibilitychange', visibility);
        window.addEventListener('pagehide', hide);
        window.addEventListener('pageshow', show);
        return () => {
            document.removeEventListener('visibilitychange', visibility);
            window.removeEventListener('pagehide', hide);
            window.removeEventListener('pageshow', show);
        };
    }, []);

    useEffect(() => {
        setReady(false);
        if (!active || !visible) return;
        let disposed = false;
        let stream: MediaStream | undefined;
        const videoElement = videoRef.current;
        let readinessTimer: ReturnType<typeof setInterval> | undefined;
        const cameraApi = navigator.mediaDevices;
        if (!cameraApi?.getUserMedia) {
            setError('Camera access requires a supported browser and a secure connection.');
            return;
        }
        setError('');
        const start = async () => {
            try {
                stream = await cameraApi.getUserMedia({ audio: false, video: {
                    ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }),
                    width: { ideal: 1920 }, height: { ideal: 1080 },
                } });
                if (disposed) { stream.getTracks().forEach(track => track.stop()); return; }
                const track = stream.getVideoTracks()[0];
                track.addEventListener('ended', () => {
                    if (!disposed) { setReady(false); setError('Camera stopped. Tap Restart camera to reconnect.'); }
                });
                const capabilities = track.getCapabilities?.() as FocusCapabilities | undefined;
                if (capabilities?.focusMode?.includes('continuous')) {
                    // Safari may expose no focus control. Never pretend unsupported focus succeeded.
                    await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => undefined);
                }
                if (disposed) return;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    // loadeddata alone is unreliable on mobile. Check the actual frame as well.
                    const checkFrame = () => {
                        const video = videoRef.current;
                        if (!disposed && video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
                            setReady(true);
                            setError('');
                            clearInterval(readinessTimer);
                        }
                    };
                    readinessTimer = setInterval(checkFrame, 250);
                    void videoRef.current.play().then(checkFrame).catch(() => {
                        if (!disposed) setError('Tap Capture to start the camera, or use your phone camera.');
                    });
                    checkFrame();
                }
                const available = await cameraApi.enumerateDevices?.().catch(() => []) ?? [];
                if (!disposed) setDevices(available.filter(device => device.kind === 'videoinput'));
            } catch (reason) {
                stream?.getTracks().forEach(track => track.stop());
                if (!disposed) {
                    setReady(false);
                    setError('Could not start camera: ' + (reason instanceof Error ? reason.message : 'Please retry.'));
                }
            }
        };
        void start();
        return () => {
            disposed = true;
            clearInterval(readinessTimer);
            stream?.getTracks().forEach(track => track.stop());
            if (videoElement && videoElement.srcObject === stream) videoElement.srcObject = null;
        };
    }, [active, visible, deviceId, generation]);

    return {
        ready, error, devices, deviceId, videoRef,
        markReady: () => {
            const video = videoRef.current;
            if (video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) setReady(true);
        },
        selectDevice: (id: string) => { setReady(false); setDeviceId(id); },
        restart: () => { setReady(false); setGeneration(value => value + 1); },
    };
}
