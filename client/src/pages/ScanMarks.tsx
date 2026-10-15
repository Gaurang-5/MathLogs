import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import Layout from '../components/Layout';
import Dropdown from '../components/Dropdown';
import { TeacherButton, TeacherSurface } from '../components/teacher-ui';
import { MultiStickerReview } from '../components/MultiStickerReview';
import { captureStickerFrame, stickerFrameBlob } from '../utils/ocr';
import { useStickerCamera } from '../utils/useStickerCamera';
import { apiRequest } from '../utils/api';

type ScanTest={id:string;name?:string;subject?:string;maxMarks?:number};
export default function ScanMarks(){
    const [searchParams]=useSearchParams();
    const [tests,setTests]=useState<ScanTest[]>([]),[selectedTestId,setSelectedTestId]=useState(searchParams.get('testId')||'');
    const [scanning,setScanning]=useState(false),[cameraSessionOpen,setCameraSessionOpen]=useState(false),[usingPhoneCamera,setUsingPhoneCamera]=useState(false);
    const [multiPhoto,setMultiPhoto]=useState<Blob|null>(null),[debugImage,setDebugImage]=useState<string|null>(null);
    const [isProcessingOCR,setIsProcessingOCR]=useState(false),[scanError,setScanError]=useState('');
    const photoInput=useRef<HTMLInputElement>(null),overlayRef=useRef<HTMLDivElement>(null),previewUrl=useRef<string|null>(null);
    const mounted=useRef(true),processing=useRef(false),captureId=useRef(0);
    const {videoRef,ready:cameraReady,error:cameraError,devices:cameraDevices,deviceId:cameraDeviceId,markReady:markCameraReady,selectDevice:selectCameraDevice,restart:restartCamera}=useStickerCamera(cameraSessionOpen&&!usingPhoneCamera);
    const clearPreview=()=>{if(previewUrl.current)URL.revokeObjectURL(previewUrl.current);previewUrl.current=null;setDebugImage(null);};
    useEffect(()=>{mounted.current=true;void apiRequest<ScanTest[]>('/tests').then(value=>{if(mounted.current)setTests(value);}).catch(()=>{if(mounted.current)setScanError('Could not load tests. Reload to try again.');});return()=>{mounted.current=false;captureId.current++;if(previewUrl.current)URL.revokeObjectURL(previewUrl.current);};},[]);
    useEffect(()=>{const input=photoInput.current;const restore=()=>setUsingPhoneCamera(false);input?.addEventListener('cancel',restore);return()=>input?.removeEventListener('cancel',restore);},[cameraSessionOpen]);
    useEffect(()=>{
        if(!scanning)return;const previous=document.activeElement as HTMLElement|null;overlayRef.current?.focus();
        const trap=(event:KeyboardEvent)=>{if(event.key!=='Tab')return;const nodes=Array.from(overlayRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled)')||[]),first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&(document.activeElement===first||document.activeElement===overlayRef.current)){event.preventDefault();last?.focus();}else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===overlayRef.current)){event.preventDefault();first?.focus();}};
        document.addEventListener('keydown',trap);return()=>{document.removeEventListener('keydown',trap);previous?.focus();};
    },[scanning]);
    const cancelCapture=()=>{captureId.current++;processing.current=false;setIsProcessingOCR(false);setMultiPhoto(null);setScanning(false);setCameraSessionOpen(false);setUsingPhoneCamera(false);setScanError('');clearPreview();};
    const handleCapture=async(photo?:File)=>{
        if(!mounted.current||!cameraSessionOpen||processing.current)return;
        if(!photo&&(!videoRef.current||videoRef.current.readyState<2||!videoRef.current.videoWidth)){void videoRef.current?.play().catch(()=>undefined);setScanError('Camera is starting. Try Capture again when the preview is moving, or use phone camera.');return;}
        const id=++captureId.current;processing.current=true;setIsProcessingOCR(true);setScanError('');clearPreview();
        try{
            if(photo&&!['image/jpeg','image/png','image/webp'].includes(photo.type))throw new Error('Choose a JPEG, PNG, or WebP photo.');
            const image=photo??await stickerFrameBlob(captureStickerFrame(videoRef.current!));
            if(!mounted.current||id!==captureId.current)return;
            previewUrl.current=URL.createObjectURL(image);setDebugImage(previewUrl.current);setMultiPhoto(image);setScanning(false);
        }catch(error){if(mounted.current&&id===captureId.current)setScanError(error instanceof Error?error.message:'Capture failed. Try again.');}
        finally{if(mounted.current&&id===captureId.current){processing.current=false;setIsProcessingOCR(false);}}
    };
    return <Layout title="Scan Marks" hideMobileNav={scanning||!!multiPhoto}>
        {!cameraSessionOpen&&<TeacherSurface className="mx-auto mt-10 max-w-md space-y-5 p-6">
            <h2 className="text-xl font-semibold text-app-text">Scan marks</h2>
            <Dropdown label="Select test" value={selectedTestId} onChange={setSelectedTestId} placeholder="Choose test" searchable options={tests.map(test=>({value:test.id,label:`${test.name||'Test'}${test.subject?` · ${test.subject}`:''}`}))}/>
            <p className="text-sm text-app-text-secondary">Capture one sticker or several together. Keep every QR and handwritten mark clearly visible.</p>
            {scanError&&<p role="alert" className="text-sm text-danger">{scanError}</p>}
            <TeacherButton className="w-full" disabled={!selectedTestId} onClick={()=>{setScanError('');setCameraSessionOpen(true);setScanning(true);}}>Start Camera</TeacherButton>
        </TeacherSurface>}
        {multiPhoto&&debugImage&&createPortal(<MultiStickerReview photo={multiPhoto} imageUrl={debugImage} testId={selectedTestId} maxMarks={tests.find(t=>t.id===selectedTestId)?.maxMarks??100} onClose={()=>{setMultiPhoto(null);clearPreview();setScanning(true);}}/>,document.body)}
            {/* Scanner Active - Immersive Fullscreen Mobile UI */}
            {cameraSessionOpen && createPortal(
                <div ref={scanning ? overlayRef : undefined} tabIndex={scanning ? -1 : undefined}
                    role={scanning ? 'dialog' : undefined} aria-modal={scanning || undefined} aria-hidden={!scanning}
                    aria-label="Capture marks sticker" onKeyDown={event => { if (event.key === 'Escape') cancelCapture(); }}
                    className={`fixed inset-0 bg-black overflow-hidden ${scanning ? 'z-[200]' : 'invisible pointer-events-none -z-10'}`}>
                    <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden
                        onChange={event => {
                            const photo = event.target.files?.[0];
                            event.target.value = '';
                            setUsingPhoneCamera(false);
                            if (photo) void handleCapture(photo);
                        }} />
                    {/* Camera Viewfinder */}
                    <video ref={videoRef} autoPlay playsInline muted onLoadedData={markCameraReady} onCanPlay={markCameraReady} onPlaying={markCameraReady}
                        className="absolute inset-0 h-full w-full object-contain" aria-label="Sticker camera preview" />
                    {isProcessingOCR && debugImage && <img src={debugImage} alt="Captured sticker" className="absolute inset-0 h-full w-full object-contain" />}

                    {scanning && !isProcessingOCR && !usingPhoneCamera && (
                        <div className="absolute top-[max(1rem,env(safe-area-inset-top))] inset-x-4 z-20 mx-auto flex max-w-lg flex-wrap gap-2">
                            {cameraDevices.length > 1 && <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-app-surface-opaque px-3 text-app-text text-sm">
                                <span>Camera</span>
                                <select aria-label="Camera lens" value={cameraDeviceId} onChange={event => selectCameraDevice(event.target.value)}
                                    className="min-h-11 min-w-0 flex-1 bg-transparent focus-visible:outline-2">
                                    <option value="">Auto (rear)</option>
                                    {cameraDevices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}
                                </select>
                            </label>}
                            <TeacherButton variant="secondary" onClick={restartCamera}>Restart camera</TeacherButton>
                        </div>
                    )}
                    {/* Bottom Controls */}
                    <div className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-0 right-0 z-20 flex flex-col items-center gap-4 px-6">
                        {isProcessingOCR ? (
                            <div className="flex items-center gap-3 bg-white/90 backdrop-blur-md px-6 py-3 rounded-full shadow-xl animate-in slide-in-from-bottom-4">
                                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                                <span role="status" className="font-bold text-app-text">Taking photo…</span>
                            </div>
                        ) : (
                            <div className="bg-black/60 backdrop-blur-md text-white text-center px-4 py-2 rounded-full border border-white/10 max-w-xs">
                                <p className="text-sm font-medium">{cameraReady ? 'Ready — tap Capture' : 'Starting camera…'}</p>
                                <p className="text-xs text-white/70 mt-0.5">Keep every QR and handwritten mark clearly visible.</p>
                            </div>
                        )}

                        {(scanError || cameraError) && <p role="alert" className="max-w-sm rounded-xl bg-app-surface-opaque p-3 text-app-text">{scanError || cameraError}</p>}
                        <TeacherButton variant="secondary" size="lg" onClick={() => void handleCapture()}
                            disabled={isProcessingOCR || usingPhoneCamera} loading={isProcessingOCR} className="w-full max-w-xs">
                            {isProcessingOCR ? 'Taking photo…' : 'Capture'}
                        </TeacherButton>
                        <div className="flex flex-wrap justify-center gap-2">
                            <TeacherButton variant="secondary" disabled={isProcessingOCR} onClick={() => {
                                if (usingPhoneCamera) { setUsingPhoneCamera(false); return; }
                                // Release the live track before handing camera control to iOS/Android.
                                const stream = videoRef.current?.srcObject as MediaStream | null;
                                stream?.getTracks().forEach(track => track.stop());
                                setUsingPhoneCamera(true);
                                photoInput.current?.click();
                            }}>{usingPhoneCamera ? 'Return to live camera' : 'Use phone camera'}</TeacherButton>
                            <TeacherButton variant="secondary" onClick={cancelCapture}>Cancel Scan</TeacherButton>
                        </div>
                    </div>
                </div>, document.body
            )}

    </Layout>;
}
