import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ScanMarks from './ScanMarks';

const mocks = vi.hoisted(() => ({ api: vi.fn(), capture: vi.fn(), blob: vi.fn(), qr: vi.fn(), photoQR: vi.fn(), ocr: vi.fn(),codes:vi.fn(),marks:vi.fn() }));
vi.mock('../utils/api', () => ({ apiRequest: mocks.api }));
vi.mock('../components/Layout', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('../utils/ocr', () => ({ captureStickerFrame: mocks.capture, stickerFrameBlob: mocks.blob, readStudentQR: mocks.qr, readStudentQRFromPhoto: mocks.photoQR, extractMarksFromSticker: mocks.ocr }));
vi.mock('../utils/multiSticker',()=>({readPhotoCodes:mocks.codes,extractAllPhotoMarks:mocks.marks}));
let container: HTMLDivElement;
let root: Root;
const stop = vi.fn();
const getUserMedia = vi.fn();
const enumerateDevices = vi.fn();
const applyConstraints = vi.fn();
const track = { stop, addEventListener: vi.fn(), getCapabilities: () => ({ focusMode: ['continuous'] }), applyConstraints };
const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
const click = async (label: string) => {
  const button = [...document.body.querySelectorAll('button')].find(node => node.textContent?.trim() === label)!;
  expect(button).toBeTruthy();
  await act(async () => button.click());
};
beforeEach(async () => {
  vi.clearAllMocks();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(2);
  vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(1920);
  vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(1080);
  getUserMedia.mockResolvedValue(stream);
  enumerateDevices.mockResolvedValue([{ kind: 'videoinput', deviceId: 'wide', label: 'Rear camera' }, { kind: 'videoinput', deviceId: 'ultra', label: 'Ultra-wide camera' }]);
  applyConstraints.mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia, enumerateDevices } });
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.stubGlobal('URL', { createObjectURL: vi.fn().mockReturnValue('blob:photo'), revokeObjectURL: vi.fn() });
  mocks.api.mockImplementation(async (path: string,_method,body) => path === '/marks/batch'?{results:body.marks.map((m:any)=>({studentId:m.studentId,saved:true}))}:path === '/tests'
    ? [{ id: 'test', className: '10', maxMarks: 100 }]
    : {results:[{humanId:'A',student:{id:'student',humanId:'A',name:'Aarav',marks:[]}}]});
  mocks.codes.mockResolvedValue({width:100,height:100,codes:[{humanId:'A',corners:[]}]});
  mocks.marks.mockImplementation(async(_image,geometry)=>geometry.codes.map((code:any)=>({code,score:'0'})));
  mocks.capture.mockReturnValue({});
  mocks.blob.mockResolvedValue(new Blob(['photo']));
  mocks.qr.mockReturnValue('student-qr');
  mocks.photoQR.mockResolvedValue('student-qr');
  mocks.ocr.mockResolvedValue({ score: '0', status: 'read' });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<MemoryRouter initialEntries={['/scan?testId=test']}><ScanMarks /></MemoryRouter>));
  await click('Start Camera');
  await act(async () => document.body.querySelector('video')!.dispatchEvent(new Event('loadeddata')));
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('captures only on click and uses one review without a mode selector',async()=>{
 expect(mocks.capture).not.toHaveBeenCalled();expect(document.querySelector('input[type=radio]')).toBeNull();await click('Capture');expect(mocks.capture).toHaveBeenCalledTimes(1);expect(mocks.marks).toHaveBeenCalledTimes(1);expect(document.querySelector<HTMLInputElement>('#sticker-score-0')!.value).toBe('0');expect(mocks.api.mock.calls.some(([path])=>path==='/marks')).toBe(false);await click('Confirm');expect(mocks.api).toHaveBeenCalledWith('/marks/batch','POST',{testId:'test',marks:[{studentId:'student',score:'0',expectedScore:null}]});expect(getUserMedia).toHaveBeenCalledTimes(1);
});
it('ignores late frame encoding after cancellation',async()=>{
 let finish!:(b:Blob)=>void;mocks.blob.mockReturnValue(new Promise(resolve=>finish=resolve));await click('Capture');await click('Cancel Scan');await act(async()=>finish(new Blob(['photo'])));expect(mocks.codes).not.toHaveBeenCalled();expect(document.querySelector('video')).toBeNull();
});
it('passes the phone photo unchanged to QR analysis and unified reader',async()=>{
 const file=new File(['original'],'photo.jpg',{type:'image/jpeg'}),input=document.querySelector<HTMLInputElement>('input[type=file]')!;Object.defineProperty(input,'files',{value:[file]});await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));expect(mocks.codes).toHaveBeenCalledWith(file,expect.any(AbortSignal));expect(mocks.marks.mock.calls[0][0]).toBe(file);expect(mocks.capture).not.toHaveBeenCalled();
});
it('releases and restores the camera on visibility changes',async()=>{
 vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden');await act(async()=>document.dispatchEvent(new Event('visibilitychange')));expect(stop).toHaveBeenCalledTimes(1);vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');await act(async()=>document.dispatchEvent(new Event('visibilitychange')));expect(getUserMedia).toHaveBeenCalledTimes(2);
});
it('selects the requested lens and supported autofocus',async()=>{
 expect(applyConstraints).toHaveBeenCalledWith({advanced:[{focusMode:'continuous'}]});const select=document.querySelector<HTMLSelectElement>('[aria-label="Camera lens"]')!;await act(async()=>{select.value='ultra';select.dispatchEvent(new Event('change',{bubbles:true}));});expect(getUserMedia.mock.calls[1][0].video.deviceId).toEqual({exact:'ultra'});
});
it('explains an unready camera',async()=>{vi.spyOn(HTMLMediaElement.prototype,'readyState','get').mockReturnValue(0);await click('Capture');expect(document.body.textContent).toContain('Camera is starting');expect(mocks.capture).not.toHaveBeenCalled();});
it('restarts a stuck camera only on request',async()=>{await click('Restart camera');expect(getUserMedia).toHaveBeenCalledTimes(2);expect(stop).toHaveBeenCalledTimes(1);expect(mocks.marks).not.toHaveBeenCalled();});
it('stops a late permission result after closing',async()=>{
 let finish!:(value:typeof stream)=>void;getUserMedia.mockReturnValueOnce(new Promise(resolve=>finish=resolve));await click('Restart camera');await click('Cancel Scan');const lateStop=vi.fn(),lateTrack={...track,stop:lateStop};await act(async()=>finish({getTracks:()=>[lateTrack],getVideoTracks:()=>[lateTrack]}));expect(lateStop).toHaveBeenCalledTimes(1);
});
it('restores the camera after cancelling the phone picker',async()=>{await click('Use phone camera');await act(async()=>document.querySelector('input[type=file]')!.dispatchEvent(new Event('cancel')));expect(getUserMedia).toHaveBeenCalledTimes(2);});
