import { useState } from 'react';
import type { PhotoCodes } from '../utils/multiSticker';

/** QR outlines represent actual local detections, not guessed OCR completion. */
export function StickerScanProgress({ imageUrl, geometry, message, percent }: {
    imageUrl: string; geometry: PhotoCodes | null; message: string; percent?: number;
}) {
    const [size, setSize] = useState<{ width: number; height: number } | null>(null);
    const dimensions = geometry || size;
    return <div className="w-full max-w-xl text-center">
        <div role="progressbar" aria-label={message} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
            className="relative h-[min(58dvh,30rem)] overflow-hidden rounded-2xl border border-app-border bg-app-surface-opaque shadow-sm">
            <img src={imageUrl} alt="Captured stickers being scanned" className="absolute inset-0 h-full w-full object-contain"
                onLoad={event => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} />
            {dimensions && <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${dimensions.width} ${dimensions.height}`} preserveAspectRatio="xMidYMid meet">
                <rect width={dimensions.width} height={dimensions.height} fill="black" opacity="0.08" />
                {geometry?.codes.map((code, index) => <g key={`${code.humanId}-${index}`} data-qr-marker="true">
                    <polygon points={code.corners.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="white" strokeWidth="5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                    <polygon points={code.corners.map(p => `${p.x},${p.y}`).join(' ')} fill="white" fillOpacity="0.08" stroke="#171717" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                </g>)}
                <g className="sticker-photo-sweep">
                    <line x1="0" y1="0" x2={dimensions.width} y2="0" stroke="white" strokeOpacity="0.5" strokeWidth="12" vectorEffect="non-scaling-stroke" />
                    <line x1="0" y1="0" x2={dimensions.width} y2="0" stroke="white" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                </g>
            </svg>}
        </div>
        <p className="mt-5 text-lg font-semibold tracking-tight text-app-text">Reading your stickers</p>
        <p role="status" className="mt-2 text-sm text-app-text-secondary">{message}{percent === undefined ? '' : ` ${percent}%`}</p>
        {!!geometry?.codes.length && <p className="mt-2 text-xs text-app-text-secondary">{geometry.codes.length} {geometry.codes.length === 1 ? 'QR detected' : 'QRs detected'}</p>}
    </div>;
}
